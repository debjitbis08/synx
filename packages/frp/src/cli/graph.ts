#!/usr/bin/env node

/**
 * CLI Tool for FRP Graph Visualization
 *
 * Usage:
 *   synx-graph <file> [options]
 *
 * Examples:
 *   synx-graph src/components/ThemeDropdown.ts
 *   synx-graph src/components/ThemeDropdown.ts --format mermaid
 *   synx-graph src/components/ThemeDropdown.ts --format dot -o graph.dot
 */

import * as fs from "fs";
import * as path from "path";
import {
  analyzeFile,
  exportMermaid,
  exportDOT,
  exportD3,
  exportJSON,
  printGraph,
} from "../graph-analyzer-v2";

// ============================================================================
// CLI Arguments
// ============================================================================

interface CLIOptions {
  file: string;
  format: "mermaid" | "dot" | "d3" | "json" | "console";
  output?: string;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { file: "", format: "console", help: true };
  }

  const file = args[0];
  let format: CLIOptions["format"] = "console";
  let output: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--format" || arg === "-f") {
      const formatArg = args[++i];
      if (
        formatArg === "mermaid" ||
        formatArg === "dot" ||
        formatArg === "d3" ||
        formatArg === "json" ||
        formatArg === "console"
      ) {
        format = formatArg;
      } else {
        console.error(`Unknown format: ${formatArg}`);
        process.exit(1);
      }
    } else if (arg === "--output" || arg === "-o") {
      output = args[++i];
    }
  }

  return { file, format, output, help: false };
}

function printHelp() {
  console.log(`
FRP Graph Visualization Tool

Usage:
  synx-graph <file> [options]

Options:
  -f, --format <type>    Output format: mermaid, dot, d3, json, console (default: console)
  -o, --output <file>    Write output to file instead of stdout
  -h, --help             Show this help message

Examples:
  # Print graph to console
  synx-graph src/components/ThemeDropdown.ts

  # Generate Mermaid diagram
  synx-graph src/components/ThemeDropdown.ts --format mermaid

  # Generate Graphviz DOT file
  synx-graph src/components/ThemeDropdown.ts --format dot -o graph.dot

  # Generate D3.js JSON for interactive visualization
  synx-graph src/components/ThemeDropdown.ts --format d3 -o graph.json

  # Pipe to file
  synx-graph src/components/ThemeDropdown.ts -f mermaid > docs/graph.md

  # Generate PNG with Graphviz
  synx-graph src/components/ThemeDropdown.ts -f dot | dot -Tpng > graph.png
`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Resolve file path
  const filePath = path.resolve(process.cwd(), options.file);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    // Analyze the file
    console.error(`Analyzing: ${filePath}`);
    const graph = analyzeFile(filePath);

    // Generate output
    let output: string;

    switch (options.format) {
      case "mermaid":
        output = exportMermaid(graph);
        break;
      case "dot":
        output = exportDOT(graph);
        break;
      case "d3":
        output = JSON.stringify(exportD3(graph), null, 2);
        break;
      case "json":
        output = exportJSON(graph);
        break;
      case "console":
      default:
        printGraph(graph);
        return;
    }

    // Write output
    if (options.output) {
      fs.writeFileSync(options.output, output, "utf-8");
      console.error(`Output written to: ${options.output}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error(`Error analyzing file: ${error}`);
    process.exit(1);
  }
}

main();
