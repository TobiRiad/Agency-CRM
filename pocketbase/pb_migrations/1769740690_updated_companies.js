/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3866053794")

  // add field
  collection.fields.addAt(15, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1631394489",
    "hidden": false,
    "id": "relation4161491668",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "batch",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3866053794")

  // remove field
  collection.fields.removeById("relation4161491668")

  return app.save(collection)
})
