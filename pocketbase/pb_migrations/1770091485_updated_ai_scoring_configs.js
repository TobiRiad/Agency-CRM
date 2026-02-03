/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3633716616")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id != \"\"",
    "listRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3633716616")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "deleteRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "listRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "updateRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && campaign.user = @request.auth.id"
  }, collection)

  return app.save(collection)
})
