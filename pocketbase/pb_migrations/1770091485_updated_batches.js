/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1631394489")

  // update collection data
  unmarshal({
    "deleteRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1631394489")

  // update collection data
  unmarshal({
    "deleteRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "updateRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id"
  }, collection)

  return app.save(collection)
})
