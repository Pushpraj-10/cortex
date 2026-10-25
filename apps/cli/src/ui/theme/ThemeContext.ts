import { createContext, useContext } from "react";
import { getTheme, type Theme } from "./themes.js";

/** The active theme. Defaults to dark so a component rendered on its own (in a test, say) still has colours. */
export const ThemeContext = createContext<Theme>(getTheme("dark"));

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
