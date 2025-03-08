const path = require("path")

module.exports = [
  {
    entry: "./src/holster.js",
    mode: "development",
    devtool: "inline-source-map",
    output: {
      path: path.resolve(__dirname, "build"),
      filename: "holster.js",
      library: {
        name: "Holster",
        type: "assign",
      },
    },
  },
  {
    entry: "./src/holster.js",
    mode: "production",
    devtool: "source-map",
    output: {
      path: path.resolve(__dirname, "build"),
      filename: "holster.min.js",
      library: {
        name: "Holster",
        type: "assign",
      },
    },
  },
]
