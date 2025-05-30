Holster is a service that allows synchronising data between devices using Node,
Deno, Bun or the browser.

It is a port of [GunDB](https://gun.eco), following
[Porting Gun](https://github.com/gundb/port) and is implemented as JavaScript
modules so that it can run in any environment. A build version of Holster is
also provided using [esbuild](https://esbuild.github.io), to run in production.

Check out the [Github Wiki](https://github.com/mblaney/holster/wiki) for how
to get started using the API, and for more information.

### Quick Start

- Clone this repo and run `npm install`.
- Run the server with `node src/index.js`.
- Open `http://localhost:3000/examples/index.html` in the browser.
- You will then also have access to the Holster API via the `holster` object in
the console.

### Development

- When modifying src files run: `npx prettier src --write && npm run build`
- When modifying tests run: `npx prettier test --write`
- To run the tests use: `npm run test`
