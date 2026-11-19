// Node names available to the nodeRef editor (contact faces + glTF nodes of the template being edited).
import { createContext, useContext } from "react";

export const NodeRefOptionsContext = createContext<readonly string[]>([]);

export const useNodeRefOptions = (): readonly string[] => useContext(NodeRefOptionsContext);
