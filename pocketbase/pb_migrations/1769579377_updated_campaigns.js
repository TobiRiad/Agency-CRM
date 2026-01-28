/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2270728936")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select371961626",
    "maxSelect": 0,
    "name": "industry_type",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "text",
      "dropdown"
    ]
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json3886730482",
    "maxSize": 0,
    "name": "industry_options",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2270728936")

  // remove field
  collection.fields.removeById("select371961626")

  // remove field
  collection.fields.removeById("json3886730482")

  return app.save(collection)
})
