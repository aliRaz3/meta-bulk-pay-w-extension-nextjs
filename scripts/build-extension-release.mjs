import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import archiver from 'archiver';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify as terserMinify } from 'terser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourceDir = path.join(projectRoot, 'browser-extension');
const outputDir = path.join(projectRoot, 'dist', 'browser-extension-release');
const outputZip = path.join(projectRoot, 'dist', 'browser-extension-release.zip');
const integrityFileName = 'integrity-manifest.txt';

const lightObfuscationOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayShuffle: true,
  stringArrayThreshold: 0.35,
  transformObjectKeys: false,
};

async function ensurePathExists(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function collectJavaScriptFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function collectFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function minifyExtensionJavaScript(rootDir) {
  const jsFiles = await collectJavaScriptFiles(rootDir);

  for (const filePath of jsFiles) {
    const sourceCode = await fs.readFile(filePath, 'utf8');
    const result = await terserMinify(sourceCode, {
      compress: {
        passes: 2,
      },
      ecma: 2020,
      format: {
        comments: false,
      },
      mangle: false,
      module: false,
      toplevel: false,
    });

    if (result.code) {
      await fs.writeFile(filePath, result.code, 'utf8');
    }
  }

  return jsFiles.length;
}

async function obfuscateExtensionJavaScriptLightly(rootDir) {
  const jsFiles = await collectJavaScriptFiles(rootDir);

  for (const filePath of jsFiles) {
    const sourceCode = await fs.readFile(filePath, 'utf8');
    const obfuscatedCode = JavaScriptObfuscator
      .obfuscate(sourceCode, lightObfuscationOptions)
      .getObfuscatedCode();
    await fs.writeFile(filePath, obfuscatedCode, 'utf8');
  }

  return jsFiles.length;
}

async function generateIntegrityManifest(rootDir) {
  const filePaths = (await collectFiles(rootDir))
    .filter((filePath) => path.basename(filePath) !== integrityFileName)
    .sort((a, b) => a.localeCompare(b));

  const lines = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
    const content = await fs.readFile(filePath);
    const digest = createHash('sha256').update(content).digest('hex');
    lines.push(`${digest}  ${relativePath}`);
  }

  const manifestPath = path.join(rootDir, integrityFileName);
  await fs.writeFile(manifestPath, `${lines.join('\n')}\n`, 'utf8');
  return manifestPath;
}

function zipDirectory(inputDir, zipFilePath) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensurePathExists(zipFilePath);
      const stream = createWriteStream(zipFilePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      stream.on('close', () => resolve(archive.pointer()));
      archive.on('error', (error) => reject(error));

      archive.pipe(stream);
      archive.directory(inputDir, false);
      await archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.rm(outputZip, { force: true });

  console.log('Stage 1/5: Copying extension source as-is...');
  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  await fs.cp(sourceDir, outputDir, { recursive: true });

  console.log('Stage 2/5: Minifying extension JavaScript...');
  const minifiedCount = await minifyExtensionJavaScript(outputDir);

  console.log('Stage 3/5: Applying light obfuscation...');
  const obfuscatedCount = await obfuscateExtensionJavaScriptLightly(outputDir);

  console.log('Stage 4/5: Generating integrity manifest...');
  const integrityManifestPath = await generateIntegrityManifest(outputDir);

  console.log('Stage 5/5: Packaging release ZIP...');
  const zipBytes = await zipDirectory(outputDir, outputZip);

  console.log('Release build complete.');
  console.log(`Source: ${sourceDir}`);
  console.log(`Output folder: ${outputDir}`);
  console.log(`Output zip: ${outputZip}`);
  console.log(`Minified JavaScript files: ${minifiedCount}`);
  console.log(`Obfuscated JavaScript files: ${obfuscatedCount}`);
  console.log(`Integrity manifest: ${integrityManifestPath}`);
  console.log(`Zip size: ${Math.round(zipBytes / 1024)} KB`);
  console.log('Pipeline: copy extension -> terser minify -> light obfuscation -> integrity manifest -> ZIP');
}

main().catch((error) => {
  console.error('Failed to build release extension package.');
  console.error(error);
  process.exitCode = 1;
});