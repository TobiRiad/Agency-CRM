/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2270728936")

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "bool2324667300",
    "name": "enable_firecrawl",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "json2119833185",
    "maxSize": 0,
    "name": "firecrawl_pages",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2270728936")

  // remove field
  collection.fields.removeById("bool2324667300")

  // remove field
  collection.fields.removeById("json2119833185")

  return app.save(collection)
})
