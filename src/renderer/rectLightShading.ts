// GLSL of the analytic one-sided rectangle light shared by the strip term (stripShading.ts, Phase 15.4) and the
// sky portals (skyShading.ts, Phase 15.5). CPU mirrors: rectFormFactor in linearStrip.ts and rectSpecular in
// rectSpecular.ts. Both snippets are include-guarded, so every patch that needs them may insert them.
//
// Diffuse: the exact Lambertian form factor of the rectangle, Three.js r187's RectAreaLight diffuse maths
// (`LTC_Evaluate` with an identity matrix) without LTC textures.
// Specular (Phase 15.4 gloss): a representative point (Karis 2013, "Real Shading in Unreal Engine 4"): the point
// of the rectangle closest to the reflected view ray, evaluated with Three.js's own `BRDF_GGX`, times the
// receiver's irradiance from the whole rectangle (π · L · form factor) and a widening normalization
// (α/α'_length) · (α/α'_width), α'_k = min(α + min(h_k / (√π · d), cap), 1) for half extent h_k at distance d.
// The √π makes a small mirror-like surface (α → 0) reflect exactly the rectangle's radiance L × Fresnel; a rough
// one (α ≫ h/d) tends to the point-light result; the cap (`rectGlossWidenCap`) keeps a long strip's streak at
// 75–94 % of a brute-force integral. No LTC textures, so no texture units.
import { rectGlossWidenCap } from "./rectSpecular";

/** Inserted after `#include <common>` (vec3 maths only). */
export const rectFormFactorGlsl = /* glsl */ `
#ifndef HP_RECT_FORM
#define HP_RECT_FORM
// Three.js r187 LTC_EdgeVectorFormFactor.
vec3 hpRectEdge( const in vec3 v1, const in vec3 v2 ) {
  float x = dot( v1, v2 );
  float y = abs( x );
  float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
  float b = 3.4175940 + ( 4.1616724 + y ) * y;
  float v = a / b;
  float thetaSinTheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
  return cross( v1, v2 ) * thetaSinTheta;
}
// Three.js r187 LTC_Evaluate( N, V, P, mat3( 1.0 ), corners ) without the view-dependent basis (undefined when
// V = N, as in an orthographic top view); that basis is left-handed, hence the minus sign. 0 behind the emitter.
float hpRectFormFactor( const in vec3 N, const in vec3 P, const in vec3 c0, const in vec3 c1, const in vec3 c2, const in vec3 c3 ) {
  if ( dot( cross( c1 - c0, c3 - c0 ), P - c0 ) < 0.0 ) return 0.0;
  vec3 v0 = normalize( c0 - P );
  vec3 v1 = normalize( c1 - P );
  vec3 v2 = normalize( c2 - P );
  vec3 v3 = normalize( c3 - P );
  vec3 f = hpRectEdge( v0, v1 ) + hpRectEdge( v1, v2 ) + hpRectEdge( v2, v3 ) + hpRectEdge( v3, v0 );
  float l = length( f );
  return max( ( l * l - dot( f, N ) ) / ( l + 1.0 ), 0.0 );
}
#endif
`;

/** Inserted after `#include <lights_physical_pars_fragment>` (needs `PhysicalMaterial` and `BRDF_GGX`). */
export const rectSpecularGlsl = /* glsl */ `
#ifndef HP_RECT_SPECULAR
#define HP_RECT_SPECULAR
#define HP_GLOSS_WIDEN_CAP ${rectGlossWidenCap.toFixed(3)}
// BRDF × widening normalization at the representative point of the rectangle C ± A ± W (A: half length, W: half
// width) seen from P (normal N, toward the viewer V). Multiply by the irradiance π · L · form factor.
vec3 hpRectSpecular( const in vec3 N, const in vec3 V, const in vec3 P, const in vec3 C, const in vec3 A, const in vec3 W, const in PhysicalMaterial material ) {
  vec3 R = reflect( - V, N );
  vec3 facing = normalize( cross( W, A ) );
  float toward = dot( R, facing );
  vec3 toC = C - P;
  // The reflected ray's hit on the rectangle's plane, else its closest approach to the centre.
  vec3 hit = ( toward < - 1e-4 ) ? P + R * ( dot( toC, facing ) / toward ) : P + R * max( dot( toC, R ), 0.0 );
  float a2 = max( dot( A, A ), 1e-12 );
  float w2 = max( dot( W, W ), 1e-12 );
  vec3 off = hit - C;
  vec3 Q = C + A * clamp( dot( off, A ) / a2, - 1.0, 1.0 ) + W * clamp( dot( off, W ) / w2, - 1.0, 1.0 );
  vec3 toQ = Q - P;
  float d = max( length( toQ ), 1e-6 );
  vec3 L = toQ / d;
  if ( dot( N, L ) <= 0.0 ) return vec3( 0.0 );
  float alpha = pow2( max( material.roughness, 0.045 ) );
  float alphaA = min( alpha + min( sqrt( a2 ) / ( 1.7724539 * d ), HP_GLOSS_WIDEN_CAP ), 1.0 );
  float alphaW = min( alpha + min( sqrt( w2 ) / ( 1.7724539 * d ), HP_GLOSS_WIDEN_CAP ), 1.0 );
  return BRDF_GGX( L, V, N, material ) * ( alpha / alphaA ) * ( alpha / alphaW );
}
#endif
`;

export const commonAnchor = "#include <common>";
export const physicalParsAnchor = "#include <lights_physical_pars_fragment>";
