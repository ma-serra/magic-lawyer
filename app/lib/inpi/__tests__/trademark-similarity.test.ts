import {
  analyzeTrademarkCollision,
  analyzeTrademarkNameSimilarity,
  normalizeTrademarkTerm,
  summarizeTrademarkCollisionJustification,
} from "@/app/lib/inpi/trademark-similarity";

describe("trademark similarity", () => {
  it("normalizes accents and punctuation", () => {
    expect(normalizeTrademarkTerm(" NATOS Ácademy! ")).toBe("natos academy");
  });

  it("flags NATO ACADEMY as critical risk for NATOS ACADEMY in the same class", () => {
    const analysis = analyzeTrademarkCollision({
      targetNormalized: "natos academy",
      candidateName: "NATO ACADEMY",
      targetClass: "41",
      candidateClass: "41",
    });

    expect(analysis.matchType).toBe("boundary_token");
    expect(analysis.sameClass).toBe(true);
    expect(analysis.collisionScore).toBe(92);
    expect(summarizeTrademarkCollisionJustification(analysis)).toContain(
      "mesma classe NICE",
    );
  });

  it("keeps related but less conflicting names below the dominant academy conflict", () => {
    const academyConflict = analyzeTrademarkCollision({
      targetNormalized: "natos academy",
      candidateName: "NATO ACADEMY",
      targetClass: "41",
      candidateClass: "41",
    });
    const engenhariaConflict = analyzeTrademarkCollision({
      targetNormalized: "natos academy",
      candidateName: "NATOS ENGENHARIA",
      targetClass: "42",
      candidateClass: "42",
    });

    expect(engenhariaConflict.matchType).toBe("token_overlap");
    expect(engenhariaConflict.collisionScore).toBe(70);
    expect(academyConflict.collisionScore).toBeGreaterThan(
      engenhariaConflict.collisionScore,
    );
  });

  it("keeps boundary token variations highly ranked in the official radar", () => {
    const analysis = analyzeTrademarkNameSimilarity(
      "natos academy",
      "Escola NATO Academy",
    );

    expect(analysis.matchType).toBe("boundary_token");
    expect(analysis.score).toBe(82);
  });
});
