
const invalidJson = `{"key": "some text with \\тom inside"}`; 
// Note: In literal JS, `\\т` means escaped backslash then `т`. 
// So the string is: { "key": "some text with \тom inside" }
// `\` followed by `т` is invalid in JSON.

function tryParse(str: string) {
    try {
        return JSON.parse(str);
    } catch(e) {
        return null;
    }
}

function cleanJsonString(str: string) {
    // Replace \ that is NOT followed by valid escape chars with \\
    // Valid escapes: " \ / b f n r t u
    return str.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

console.log("Original:", invalidJson);
const parsed1 = tryParse(invalidJson);
console.log("Make parse invalid:", parsed1 ? "Success" : "Failed");

const cleaned = cleanJsonString(invalidJson);
console.log("Cleaned:", cleaned);
const parsed2 = tryParse(cleaned);
console.log("Cleaned parse:", parsed2 ? "Success" : "Failed");
if (parsed2) {
    console.log("Value:", parsed2.key);
}

// Test checking the user's specific string fragment
const userFragment = `... но при \\том плачу ...`; 
// JS string literal `\\` is one backslash. `т` is cyrillic.
// So this simulates formatted JSON string with `\т` inside.

const simulatedUserString = `{"val": "но при \\том плачу"}`; 
// This mimics the structure stored in the DB (bad json).
console.log("\nSimulated User String:", simulatedUserString);
console.log("Original parse:", tryParse(simulatedUserString) ? "Success" : "Failed");
const cleanedUser = cleanJsonString(simulatedUserString);
console.log("Cleaned user string:", cleanedUser);
console.log("Cleaned user parse:", tryParse(cleanedUser) ? "Success" : "Failed");
