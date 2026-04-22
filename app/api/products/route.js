import { prisma } from "@/lib/prisma";
 
export async function GET() {
  try {
    const products = await prisma.product.findMany({ where: { active: true }, orderBy: { price: "asc" } });
    return Response.json({ success: true, data: products });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}