const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

function getCosmosContainer() {
  const client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY
  });

  return client
    .database(process.env.COSMOS_DB)
    .container(process.env.COSMOS_CONTAINER);
}

function getBlobContainer() {
  const blobService = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  return blobService.getContainerClient(process.env.BLOB_CONTAINER);
}

function getBlobNameFromUrl(blobUrl) {
  // blobUrl format: https://<account>.blob.core.windows.net/<container>/<blobName>
  const u = new URL(blobUrl);
  const parts = u.pathname.split("/").filter(Boolean); // [container, blobName...]
  parts.shift(); // remove container
  return parts.join("/");
}

app.http("deleteMedia", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      // Accept id/userId either as query params or JSON body
      const url = new URL(request.url);
      let id = url.searchParams.get("id");
      let userId = url.searchParams.get("userId");

      if (!id || !userId) {
        // Try JSON body
        try {
          const body = await request.json();
          id = id || body?.id;
          userId = userId || body?.userId;
        } catch {
          // ignore JSON parse errors
        }
      }

      if (!id || !userId) {
        return { status: 400, jsonBody: { error: "Missing required id and userId (query or JSON body)" } };
      }

      const cosmosContainer = getCosmosContainer();

      // Read to get blobUrl
      const { resource } = await cosmosContainer.item(id, userId).read();
      if (!resource) {
        return { status: 404, jsonBody: { error: "Item not found" } };
      }

      // Delete blob if present
      if (resource.blobUrl) {
        const blobContainer = getBlobContainer();
        const blobName = getBlobNameFromUrl(resource.blobUrl);
        const blobClient = blobContainer.getBlobClient(blobName);

        // Best effort delete
        await blobClient.deleteIfExists();
      }

      // Delete Cosmos item
      await cosmosContainer.item(id, userId).delete();

      return { status: 200, jsonBody: { message: "Deleted", id, userId } };

    } catch (err) {
      context.log.error(err);
      return { status: 500, jsonBody: { error: "Internal server error" } };
    }
  }
});
