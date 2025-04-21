const holster = Holster()

// Set readFromDisk to true to force reading from disk.
// (Restart the server so that graph is not in memory.)
const readFromDisk = false

// Wait for the websocket to connect.
setTimeout(() => {
  if (readFromDisk) {
    holster.get("mark").then("boss", {".": "species"}, data => {
      console.log("read from disk:", data)
    })
  } else {
    const update1 = {
      name: "Mark Nadal",
      boss: {
        name: "Fluffy",
        species: "a kitty",
      },
    }
    holster.get("mark").put(update1, err => {
      console.log("update1:", err)

      // Holster API stores the chained key context, so can't use the API
      // again until the first callback has returned.
      const update2 = {
        name: "Mark",
        boss: {
          species: "felis silvestris",
          color: "ginger",
        },
      }
      holster.get("mark").put(update2, err => {
        console.log("update2:", err)

        // The API sets the state on properties to the current time, so no
        // conflict resolution available here to test.
        holster.get("mark").then("boss", {".": "species"}, data => {
          console.log("get:", data)
        })
      })
    })
  }
}, 1000)
