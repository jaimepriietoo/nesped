import { redirect } from "next/navigation";

/* Ya no hay planes a la venta: quien llegue a la antigua página de precios
   (enlaces viejos, buscadores) va directo al contacto de la portada. */
export default function Precios() {
  redirect("/#contacto");
}
