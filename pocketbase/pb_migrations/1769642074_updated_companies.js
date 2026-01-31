/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3866053794")

  // add field
  collection.fields.addAt(6, new Field({
    "exceptDomains": null,
    "hidden": false,
    "id": "email3885137012",
    "name": "email",
    "onlyDomains": null,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "email"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1843675174",
    "max": 2000,
    "min": 0,
    "name": "description",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "number1848511508",
    "max": 100,
    "min": 0,
    "name": "ai_score",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2539086576",
    "max": 100,
    "min": 0,
    "name": "ai_classification",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "number1750188997",
    "max": 1,
    "min": 0,
    "name": "ai_confidence",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "json780547451",
    "maxSize": 0,
    "name": "ai_reasons",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "date2919384537",
    "max": "",
    "min": "",
    "name": "ai_scored_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text406626802",
    "max": 50,
    "min": 0,
    "name": "ai_config_version",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3866053794")

  // remove field
  collection.fields.removeById("email3885137012")

  // remove field
  collection.fields.removeById("text1843675174")

  // remove field
  collection.fields.removeById("number1848511508")

  // remove field
  collection.fields.removeById("text2539086576")

  // remove field
  collection.fields.removeById("number1750188997")

  // remove field
  collection.fields.removeById("json780547451")

  // remove field
  collection.fields.removeById("date2919384537")

  // remove field
  collection.fields.removeById("text406626802")

  return app.save(collection)
})
