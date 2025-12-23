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

app.http("updateMedia", {
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const body = await request.json();

      const { id, userId, title, description, tags } = body || {};

      if (!id || !userId) {
        return { status: 400, jsonBody: { error: "Missing required fields: id, userId" } };
      }

      const container = getCosmosContainer();

      // Read existing
      const { resource } = await container.item(id, userId).read();
      if (!resource) {
        return { status: 404, jsonBody: { error: "Item not found" } };
      }

      // Update only provided fields
      const updated = {
        ...resource,
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(tags !== undefined ? { tags } : {}),
        updatedAt: new Date().toISOString()
      };

      // Replace document
      const { resource: saved } = await container.item(id, userId).replace(updated);

      return { status: 200, jsonBody: saved };

    } catch (err) {
      context.log.error(err);
      return { status: 500, jsonBody: { error: "Internal server error" } };
    }
  }
});
