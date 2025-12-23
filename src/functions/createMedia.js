const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");
const { v4: uuidv4 } = require("uuid");

app.http("createMedia", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const body = await request.json();

      const {
        userId,
        title,
        description = "",
        tags = [],
        fileName,
        contentType,
        fileBase64
      } = body || {};

      if (!userId || !title || !fileName || !contentType || !fileBase64) {
        return {
          status: 400,
          jsonBody: { error: "Missing required fields" }
        };
      }

      const id = uuidv4();
      const now = new Date().toISOString();
      const blobName = `${id}-${fileName}`;

      // Upload file to Blob Storage
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING
      );

      const containerClient = blobServiceClient.getContainerClient(
        process.env.BLOB_CONTAINER
      );

      await containerClient.createIfNotExists();

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const buffer = Buffer.from(fileBase64, "base64");

      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType }
      });

      const blobUrl = blockBlobClient.url;

      // Save metadata to Cosmos DB
      const cosmosClient = new CosmosClient({
        endpoint: process.env.COSMOS_ENDPOINT,
        key: process.env.COSMOS_KEY
      });

      const container = cosmosClient
        .database(process.env.COSMOS_DB)
        .container(process.env.COSMOS_CONTAINER);

      const document = {
        id,
        userId,
        title,
        description,
        tags,
        fileName,
        contentType,
        blobUrl,
        createdAt: now,
        updatedAt: now
      };

      await container.items.create(document);

      return {
        status: 201,
        jsonBody: document
      };

    } catch (err) {
      context.log.error(err);
      return {
        status: 500,
        jsonBody: { error: "Internal server error" }
      };
    }
  }
});
