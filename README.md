Holster is a port of [GunDB](https://gun.eco), following
[Porting Gun](https://github.com/gundb/port). It is firstly a
[Node.js](https://nodejs.org) implementation and then uses
[webpack](https://webpack.js.org) to build browser versions.

- Run the server with: `node src/index.js`
- Run in the browser with: `file:///install-path/examples/index.html`
- When modifying src files run: `npx prettier src --write && npm run build`
- When modifying tests run: `npx prettier test --write`
- To run the tests use: `npm run test`
