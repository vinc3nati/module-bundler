const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const babel = require("@babel/core");
const traverse = require("@babel/traverse").default;

let ID = 0;

function createAsset(filename) {
  // extract file contents
  const content = fs.readFileSync(filename, "utf8");

  // generate AST from the file content
  const ast = parser.parse(content, {
    sourceType: "module",
  });

  const dependencies = [];
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    },
  });

  const { code } = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });

  return {
    id: ID++,
    dependencies,
    filename,
    code,
  };
}

function createGraph(entry) {
  const mainAsset = createAsset(entry);

  const queue = [mainAsset];
  for (const asset of queue) {
    const dirname = path.dirname(asset.filename);

    asset.mapping = {};

    asset.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath);
      const child = createAsset(absolutePath);
      asset.mapping[relativePath] = child.id;

      queue.push(child);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = "";

  graph.forEach((mod) => {
    modules += `${mod.id}: [
      function (require, module, exports) {
        /**
         * Creating a block scoped function so that modules remains isolated and not global
        **/
        ${mod.code}
      },
      /**
         * specifying the module mapping with its dependencies
        **/
      ${JSON.stringify(mod.mapping)},
    ],`;
  });

  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(name) {
          return require(mapping[name]);
        }

        const module = { exports : {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0);
    })({${modules}})
  `;

  // We simply return the result, hurray! :)
  return result;
}

const graph = createGraph("./example/entry.js");
const result = bundle(graph);

console.log(result);
