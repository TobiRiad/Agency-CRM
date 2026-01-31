/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1930317162")

  // add field
  collection.fields.addAt(11, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1600688174",
    "max": 0,
    "min": 0,
    "name": "ai_opener",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1930317162")

  // remove field
  collection.fields.removeById("text1600688174")

  return app.save(collection)
})
