/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3866053794")

  // add field
  collection.fields.addAt(16, new Field({
    "hidden": false,
    "id": "json3667799513",
    "maxSize": 0,
    "name": "firecrawl_urls",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(17, new Field({
    "hidden": false,
    "id": "json4108262004",
    "maxSize": 0,
    "name": "firecrawl_content",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(18, new Field({
    "hidden": false,
    "id": "date4143671595",
    "max": "",
    "min": "",
    "name": "firecrawl_mapped_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(19, new Field({
    "hidden": false,
    "id": "date3979131629",
    "max": "",
    "min": "",
    "name": "firecrawl_scraped_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3866053794")

  // remove field
  collection.fields.removeById("json3667799513")

  // remove field
  collection.fields.removeById("json4108262004")

  // remove field
  collection.fields.removeById("date4143671595")

  // remove field
  collection.fields.removeById("date3979131629")

  return app.save(collection)
})
