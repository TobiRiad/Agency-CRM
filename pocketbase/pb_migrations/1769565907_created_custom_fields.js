/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_2270728936",
        "hidden": false,
        "id": "relation521474781",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "campaign",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1579384326",
        "max": 100,
        "min": 1,
        "name": "name",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select2668773011",
        "maxSelect": 1,
        "name": "field_type",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "text",
          "number",
          "boolean",
          "select"
        ]
      },
      {
        "hidden": false,
        "id": "json3493198471",
        "maxSize": 0,
        "name": "options",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "number4113142680",
        "max": null,
        "min": 0,
        "name": "order",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      }
    ],
    "id": "pbc_2742815485",
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "name": "custom_fields",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2742815485");

  return app.delete(collection);
})
