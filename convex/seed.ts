// Demo data for local review: npx convex run seed:demo
import { internalMutation } from "./_generated/server";
import { today } from "./lib/rules";

const day = (n: number) => today(Date.now() + n * 86_400_000);

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("tools").first()) return "Already seeded";
    const user = (name: string, trusted = false) =>
      ctx.db.insert("users", {
        tokenIdentifier: `demo|${name.toLowerCase()}`,
        name,
        email: `${name.toLowerCase()}@example.com`,
        role: "user",
        trusted,
      });
    const maya = await user("Maya", true);
    const omar = await user("Omar");

    const tool = (ownerId: typeof maya, name: string, category: string, description: string) =>
      ctx.db.insert("tools", { ownerId, name, category, condition: "good", description });
    const drill = await tool(maya, "Cordless drill", "Power tools", "18V, two batteries and a charger.");
    await tool(maya, "Extension ladder", "Ladders", "Reaches about 6 m. Needs two people.");
    await tool(omar, "Pressure washer", "Garden", "Good for patios and bikes.");
    await tool(omar, "Tile cutter", "Hand tools", "Manual, up to 60 cm tiles.");

    // Omar borrowed the drill and is two days late: the reminder workflow will pick this up.
    await ctx.db.insert("loans", {
      toolId: drill, ownerId: maya, borrowerId: omar,
      startDate: day(-6), endDate: day(-2), status: "approved",
    });
    return "Seeded 2 users, 4 tools, 1 overdue loan";
  },
});
