import React, { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import cx from "classnames";

import "./App.css";
import HexEditor from "./components/ReactHexEditor";
import {
  RenderByteProps,
  SelectionChangedProps,
} from "./components/ReactHexEditor/types";
import hexEditorTheme from "./hexEditorTheme";
import { ListOnItemsRenderedProps } from "react-window";

interface FileMeta {
  fileName: string;
}

interface RangeOfInterest {
  start: number;
  end: number;
  value: number[];
  description: string;
}

function App() {
  const fileDataRef = useRef<Uint8Array>();

  // All ranges that we are highlighting because we matched "interesting" data in them
  const rangesRef = useRef<RangeOfInterest[]>([]);

  // Subset of rangesRef that are currently selected/have the cursor in them
  const [selectedRoi, setSelectedRoi] = useState<RangeOfInterest[]>([]);

  const [nonce, setNonce] = useState(0);
  const [fileMeta, setFileMeta] = useState<FileMeta>();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const [file] = acceptedFiles;
    if (!file) return;

    setFileMeta({
      fileName: file.name,
    });

    console.log("Dropped files", acceptedFiles);
    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(file);

    fileReader.onload = function (evt) {
      if (evt.target instanceof FileReader) {
        const data = evt.target.result;

        if (data instanceof ArrayBuffer) {
          const uint8Array = new Uint8Array(data);
          console.log("Setting file data ref to", uint8Array);
          // setFileData(uint8Array);
          fileDataRef.current = uint8Array;
          setNonce((v) => v + 1);
        }
      }
    };
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const noopSetValue = React.useCallback((offset, value) => {}, []);

  const onItemsRendered = useCallback((props: ListOnItemsRenderedProps) => {
    if (!fileDataRef.current) {
      console.log("onItemsRendered returning early");
      return;
    }

    const values = [
      {
        value: [0xb8, 0xb5, 0xf5, 0xe4],
        description: "a plug item hash",
      },
    ];

    const startOffset = props.visibleStartIndex * 0x0f;
    const endOffset = props.visibleStopIndex * 0x0f;
    const visibleSlice = fileDataRef.current.slice(startOffset, endOffset);

    const foundIndexes: RangeOfInterest[] = values.flatMap((v) => {
      const foundRanges = findSubArray(visibleSlice, v.value);

      return foundRanges.map(([start, end]) => ({
        start,
        end,
        value: v.value,
        description: v.description,
      }));
    });

    rangesRef.current = foundIndexes;
    console.log("onItemsRendered", { startOffset, endOffset, foundIndexes });
  }, []);

  function renderByte({ offset, element, value }: RenderByteProps) {
    const matchedRanges = rangesRef.current.filter(
      (v) => offset >= v.start && offset <= v.end
    );

    // TODO: handle multiple matching ranges??
    const matchedRange = matchedRanges[0];

    if (!matchedRange) {
      return element;
    }

    if (offset === matchedRange.start) {
      return withClassName(element, "range-begin");
    }

    if (offset === matchedRange.end) {
      return withClassName(element, "range-end");
    }

    return withClassName(element, "range-mid");
  }

  function onSelectionChanged({
    selectionStart,
    selectionEnd,
  }: SelectionChangedProps) {
    // TODO: probably doesnt work too much when an actual range has been selected
    const matchedRanges = rangesRef.current.filter(
      (v) => selectionStart >= v.start && selectionEnd <= v.end
    );

    console.log("onSelectionChanged", {
      selectionStart,
      selectionEnd,
      matchedRanges,
    });

    setSelectedRoi(matchedRanges);
  }

  return (
    <div className="parent">
      <div className="drop" {...getRootProps()}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the files here ...</p>
        ) : (
          <p>Drop, or click to select a file</p>
        )}
      </div>

      <div className="fileMeta">{fileMeta?.fileName}</div>

      <div className="main">
        <div className="hexViewer">
          {fileDataRef.current && (
            <HexEditor
              columns={0x10}
              data={fileDataRef.current}
              nonce={nonce}
              onSetValue={noopSetValue}
              theme={{ hexEditor: hexEditorTheme }}
              onItemsRendered={onItemsRendered}
              renderByte={renderByte}
              onSelectionChanged={onSelectionChanged}
              showColumnLabels
              readOnly
            />
          )}
        </div>

        <div className="hexAccessory">
          {selectedRoi.length > 0 && (
            <pre>{JSON.stringify(selectedRoi, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function withClassName(
  children: React.ReactNode,
  className: string | undefined
) {
  return React.Children.map(children, (child) =>
    React.isValidElement(child)
      ? React.cloneElement(child, {
          className: cx(child.props.className, className),
        })
      : child
  );
}

export default App;

function findSubArray(array: Uint8Array, subArray: number[]) {
  let i = 0;
  let subLength = subArray.length;
  let maxIndex = array.length + 1 - subLength;

  const found: [number, number][] = [];

  outerLoop: for (; i < maxIndex; i++) {
    for (var j = 0; j < subLength; j++) {
      if (array[i + j] !== subArray[j]) {
        continue outerLoop;
      }
    }

    found.push([i, i + subLength - 1]);
  }

  return found;
}
