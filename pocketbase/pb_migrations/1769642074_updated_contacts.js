/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1930317162")

  // add field
  collection.fields.addAt(9, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3866053794",
    "hidden": false,
    "id": "relation107000103",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "source_company",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1930317162",
    "hidden": false,
    "id": "relation96296528",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "source_contact",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1930317162")

  // remove field
  collection.fields.removeById("relation107000103")

  // remove field
  collection.fields.removeById("relation96296528")

  return app.save(collection)
})
