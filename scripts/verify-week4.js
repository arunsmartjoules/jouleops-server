const fs = require("fs");
const path = require("path");

function checkFileExists(filePath) {
  return fs.existsSync(filePath);
}

function findFiles(dir, fileName, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (file !== "node_modules") {
        findFiles(filePath, fileName, fileList);
      }
    } else if (file === fileName) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

console.log("--- Week 4 Cleanup Verification ---");

// 1. Check for .DS_Store
console.log("\n1. Checking for .DS_Store files...");
const dsStoreFiles = findFiles(".", ".DS_Store");
if (dsStoreFiles.length === 0) {
  console.log("✅ No .DS_Store files found.");
} else {
  console.error(
    `❌ Found ${dsStoreFiles.length} .DS_Store files:`,
    dsStoreFiles,
  );
}

// 2. Check for duplicate package.json
console.log("\n2. Checking for duplicate package.json in src/...");
if (!checkFileExists("src/package.json")) {
  console.log("✅ src/package.json correctly removed.");
} else {
  console.error("❌ src/package.json still exists!");
}

// 3. Check tsconfig.json
console.log("\n3. Checking tsconfig.json...");
if (checkFileExists("tsconfig.json")) {
  try {
    const tsconfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
    if (tsconfig.compilerOptions && tsconfig.compilerOptions.allowJs === true) {
      console.log("✅ tsconfig.json has 'allowJs': true.");
    } else {
      console.error("❌ tsconfig.json missing 'allowJs': true.");
    }
  } catch (e) {
    console.error("❌ Error parsing tsconfig.json:", e.message);
  }
} else {
  console.error("❌ tsconfig.json missing!");
}

console.log("\n--- Verification Complete ---");
