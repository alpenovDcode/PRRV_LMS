import { Plus, Trash, Pencil, ChevronUp, ChevronDown, GripVertical, Save, X, Play, FileText, CircleHelp, CornerDownRight, Lock } from "lucide-react";

const icons = { Plus, Trash, Pencil, ChevronUp, ChevronDown, GripVertical, Save, X, Play, FileText, CircleHelp, CornerDownRight, Lock };

console.log("Checking icons...");
let hasError = false;
for (const [name, component] of Object.entries(icons)) {
  if (!component) {
    console.error(`ERROR: Icon '${name}' is undefined!`);
    hasError = true;
  } else {
    // console.log(`Icon '${name}' is OK.`);
  }
}

if (hasError) {
  console.log("Found undefined icons.");
  process.exit(1);
} else {
  console.log("All icons are available.");
}
