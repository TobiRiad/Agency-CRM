/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3633716616")

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "json187483793",
    "maxSize": 0,
    "name": "custom_outputs",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3633716616")

  // remove field
  collection.fields.removeById("json187483793")

  return app.save(collection)
})
