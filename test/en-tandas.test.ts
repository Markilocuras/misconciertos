import { describe, expect, it, vi } from "vitest";

import { enTandas } from "@/lib/en-tandas";

// Esto reemplazó tres loops secuenciales de la ingesta, así que lo que hay que
// probar no es que "ande" sino que conserve exactamente lo que esos loops
// garantizaban: el orden del listado, y que una página que falla no se lleve
// puestas a las demás.

const nums = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("enTandas", () => {
  it("devuelve en el orden de entrada, no en el de llegada", async () => {
    // El primero tarda más que todos los otros a propósito: si el orden fuera
    // el de llegada, saldría último.
    const out = await enTandas(
      nums(12),
      async (i) => {
        await new Promise((r) => setTimeout(r, i === 0 ? 30 : 1));
        return i;
      },
      () => {},
      4,
    );
    expect(out).toEqual(nums(12));
  });

  it("nunca tiene más de `concurrencia` corriendo a la vez", async () => {
    let enVuelo = 0;
    let pico = 0;
    await enTandas(
      nums(20),
      async (i) => {
        enVuelo += 1;
        pico = Math.max(pico, enVuelo);
        await new Promise((r) => setTimeout(r, 2));
        enVuelo -= 1;
        return i;
      },
      () => {},
      5,
    );
    expect(pico).toBeLessThanOrEqual(5);
    // Y que de verdad paralelice: si fuera secuencial el pico sería 1.
    expect(pico).toBeGreaterThan(1);
  });

  // Lo que más importa: una página rota de una fuente no puede costar la
  // corrida entera. Los loops que esto reemplazó tenían el try/catch adentro
  // justamente por eso.
  it("una que falla no se lleva puestas a las demás", async () => {
    const onError = vi.fn();
    const out = await enTandas(
      nums(10),
      async (i) => {
        if (i % 3 === 0) throw new Error(`rota ${i}`);
        return i;
      },
      onError,
      4,
    );
    expect(out).toEqual([1, 2, 4, 5, 7, 8]);
    expect(onError).toHaveBeenCalledTimes(4);
    expect(onError.mock.calls[0][0]).toBe(0);
    expect((onError.mock.calls[0][1] as Error).message).toBe("rota 0");
  });

  it("descarta los null, que es como las fuentes dicen 'esta no servía'", async () => {
    const out = await enTandas(
      nums(6),
      async (i) => (i % 2 === 0 ? null : i),
      () => {},
    );
    expect(out).toEqual([1, 3, 5]);
  });

  it("con lista vacía no llama a nada", async () => {
    const fn = vi.fn();
    expect(await enTandas([], fn, () => {})).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("procesa todo aunque la lista no sea múltiplo de la tanda", async () => {
    const out = await enTandas(
      nums(7),
      async (i) => i,
      () => {},
      3,
    );
    expect(out).toEqual(nums(7));
  });

  // Guardarraíl: una concurrencia de 0 haría un loop infinito con `i += 0`.
  it("no se cuelga si le pasan una concurrencia absurda", async () => {
    expect(
      await enTandas(
        nums(3),
        async (i) => i,
        () => {},
        0,
      ),
    ).toEqual(nums(3));
  });
});
