const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");

function getCosmosContainer() {
  const client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
  });

  return client
    .database(process.env.COSMOS_DB)
    .container(process.env.COSMOS_CONTAINER);
}

app.http("getMedia", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId");
      const id = url.searchParams.get("id");

      if (!userId) {
        return { status: 400, jsonBody: { error: "Missing required query parameter: userId" } };
      }

      const container = getCosmosContainer();

      // If id provided, return single item
      if (id) {
        const { resource } = await container.item(id, userId).read();
        if (!resource) {
          return { status: 404, jsonBody: { error: "Item not found" } };
        }
        return { status: 200, jsonBody: resource };
      }

      // Otherwise list all items for userId
      const querySpec = {
        query: "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@userId", value: userId }]
      };

      const { resources } = await container.items.query(querySpec).fetchAll();
      return { status: 200, jsonBody: resources };

    } catch (err) {
      context.log.error(err);
      return { status: 500, jsonBody: { error: "Internal server error" } };
    }
  }
});
