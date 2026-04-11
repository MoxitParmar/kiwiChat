import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { verifyWebhook } from '@clerk/backend/webhooks'

export const clerkWebhook = httpAction(async (ctx, request) => {
  const event = await verifyWebhook(request);
  if (!event) {
    return new Response("Error occured", { status: 400 });
  }
  // eslint-disable-next-line
  const data: any = event.data;

  switch (event.type) {
    case "user.created": {
      await ctx.runMutation(api.users.mutations.createUser, {
        clerkUserId: data.id,
        email: data.email_addresses?.[0]?.email_address ?? "",
        name: `${data.first_name ?? ""} ${data.last_name ?? ""}`,
        imageUrl: data.image_url,
      });
      break;
    }

    case "user.updated": {
      const userId = await ctx.runQuery(api.users.queries.getUserIdByClerkId, {
        clerkUserId: data.id,
      });
      if (userId) {
        await ctx.runMutation(api.users.mutations.updateUser, {
          userId,
          email: data.email_addresses?.[0]?.email_address ?? "",
          name: `${data.first_name ?? ""} ${data.last_name ?? ""}`,
          imageUrl: data.image_url,
        });
      }
      break;
    }

    case "user.deleted": {
      const userId = await ctx.runQuery(api.users.queries.getUserIdByClerkId, {
        clerkUserId: data.id,
      });
      if (userId) {
        await ctx.runMutation(api.users.mutations.deleteUser, {
          userId,
        });
      }
      break;
    }
    default:
      console.warn(`Unhandled event type: ${event.type}`);
  }
  return new Response(null, { status: 200 });
});
