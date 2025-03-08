const holster = Holster()

// Set readFromDisk to true to force reading from disk.
// (Restart the server so that graph is not in memory.)
const readFromDisk = false

if (readFromDisk) {
  setTimeout(() => {
    holster.get({"#": "FDSA", ".": "species"}, (err, ack) => {
      console.log("read from disk:", err, ack)
    })
  }, 1000)
} else {
  // Create two updates that could happen in either order.
  setTimeout(() => {
    const update1 = {
      ASDF: {
        _: {"#": "ASDF", ">": {name: 2, boss: 2}},
        name: "Mark Nadal",
        boss: {"#": "FDSA"},
      },
      FDSA: {
        _: {"#": "FDSA", ">": {name: 2, species: 2, slave: 2}},
        name: "Fluffy",
        species: "a kitty",
        slave: {"#": "ASDF"},
      },
    }
    holster.put(update1, (err, ok) => console.log("update1:", err, ok))
  }, 1000 * Math.random())

  setTimeout(() => {
    const update2 = {
      ASDF: {_: {"#": "ASDF", ">": {name: 1}}, name: "Mark"},
      FDSA: {
        _: {"#": "FDSA", ">": {species: 2, color: 3}},
        species: "felis silvestris",
        color: "ginger",
      },
    }
    holster.put(update2, (err, ok) => console.log("update2:", err, ok))
  }, 1000 * Math.random())

  // They should always produce the same result no matter which order.
  setTimeout(() => {
    holster.get({"#": "FDSA", ".": "species"}, (err, ack) => {
      console.log("get:", err, ack)
    })
  }, 2000)
}
