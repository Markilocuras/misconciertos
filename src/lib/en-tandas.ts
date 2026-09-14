/**
 * Cuántos fetches a una fuente van en paralelo.
 *
 * Con el tope viejo de 8 páginas por corrida daba igual hacerlos de a uno. Con
 * 150 no: en serie, a medio segundo cada una, son más de un minuto, y el
 * `net.http_post` que dispara el cron corta a los 60s —el Worker termina igual,
 * pero en net._http_response queda registrado como timeout y parece una falla
 * que no fue—. De a seis, lo mismo tarda unos quince segundos.
 *
 * Seis y no treinta porque del otro lado hay un sitio que no nos pidió nada:
 * alcanza para que la corrida entre cómoda sin convertirla en una ráfaga.
 */
export const FETCHES_EN_PARALELO = 6;

/**
 * Mapea con concurrencia acotada, en orden y sin cortar por una que falle.
 *
 * Devuelve solo lo que salió bien: cada fuente ya venía tragándose el error de
 * una página suelta para no perder las otras, y esto conserva esa forma. Lo que
 * falla se reporta por `onError` —en la ingesta, un console.error— y lo que
 * devuelve null se descarta, que es como las fuentes dicen "esta página no era
 * lo que buscábamos".
 *
 * El orden de salida es el de entrada, no el de llegada. Importa: en Ticketek
 * la regla al juntar candidatos es "el primero que aparece gana", y si el orden
 * dependiera de cuál fetch volvió antes, dos corridas con los mismos datos
 * podrían quedar distintas.
 */
export async function enTandas<T, R>(
  items: T[],
  fn: (item: T) => Promise<R | null>,
  onError: (item: T, err: unknown) => void,
  concurrencia = FETCHES_EN_PARALELO,
): Promise<R[]> {
  const out: R[] = [];
  const tamaño = Math.max(1, concurrencia);

  for (let i = 0; i < items.length; i += tamaño) {
    const tanda = items.slice(i, i + tamaño);
    const hechas = await Promise.all(
      tanda.map(async (item) => {
        try {
          return await fn(item);
        } catch (err) {
          onError(item, err);
          return null;
        }
      }),
    );
    for (const r of hechas) if (r !== null && r !== undefined) out.push(r);
  }

  return out;
}
