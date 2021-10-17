import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AllDestinyManifestComponents } from "bungie-api-ts/destiny2";
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
import getDefinitions from "./lib/definitions";
import { hex, uint32ToArray } from "./lib/dataUtils";

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
  const [definitions, setDefinitions] =
    useState<AllDestinyManifestComponents>();

  const definitionsLoaded = useMemo(
    () => definitions && Object.keys(definitions).length > 1,
    [definitions]
  );

  useEffect(() => {
    getDefinitions()
      .then((d) => setDefinitions(d))
      .catch(console.error);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const [file] = acceptedFiles;
    if (!file) return;

    setFileMeta({ fileName: file.name });

    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(file);

    fileReader.onload = function (evt) {
      if (!(evt.target instanceof FileReader)) return;
      if (!(evt.target.result instanceof ArrayBuffer)) return;

      fileDataRef.current = new Uint8Array(evt.target.result);
      setNonce((v) => v + 1);
    };
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const onItemsRendered = useCallback(
    (props: ListOnItemsRenderedProps) => {
      if (!fileDataRef.current) {
        console.warn("Don't have fileDataRef in onItemsRendered");
        return;
      }

      if (!definitions) {
        console.warn("Don't have definitions in onItemsRendered");
        return;
      }

      const valuesToLookFor = Object.values(
        definitions.DestinyPlugSetDefinition
      ).map((def) => {
        return {
          value: uint32ToArray(def.hash),
          description: `PlugSet ${def.hash}`,
        };
      });

      console.log(valuesToLookFor);

      const startOffset = props.overscanStartIndex * 16;
      const endOffset = props.overscanStopIndex * 16;
      const visibleSlice = fileDataRef.current.slice(startOffset, endOffset);

      const foundIndexes: RangeOfInterest[] = valuesToLookFor.flatMap((v) => {
        const foundRanges = findSubArray(visibleSlice, v.value);

        return foundRanges.map(([start, end]) => ({
          start: start + startOffset,
          end: end + startOffset,
          value: v.value,
          description: v.description,
        }));
      });

      rangesRef.current = foundIndexes;
      console.log(
        `[onItemsRendered] startOffset: ${hex(startOffset)} \t endOffset: ${hex(
          endOffset
        )} \t foundIndexes:`,
        foundIndexes
      );
    },
    [definitions]
  );

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

  const onSelectionChanged = useCallback(
    ({ selectionStart, selectionEnd }: SelectionChangedProps) => {
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
    },
    []
  );

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
          {definitionsLoaded && fileDataRef.current && (
            <HexEditor
              columns={0x10}
              data={fileDataRef.current}
              nonce={nonce}
              theme={{ hexEditor: hexEditorTheme }}
              onItemsRendered={onItemsRendered}
              renderByte={renderByte}
              onSelectionChanged={onSelectionChanged}
              showColumnLabels
              showRowLabels
              readOnly
            />
          )}
        </div>

        <div className="hexAccessory">
          {!definitionsLoaded && <div>Definitions loading...</div>}

          <div>
            {selectedRoi.length > 0 && (
              <pre>{JSON.stringify(selectedRoi, null, 2)}</pre>
            )}
          </div>
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
