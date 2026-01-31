/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2270728936")

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "select1002749145",
    "maxSelect": 1,
    "name": "kind",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "leads",
      "outreach"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2270728936")

  // remove field
  collection.fields.removeById("select1002749145")

  return app.save(collection)
})
