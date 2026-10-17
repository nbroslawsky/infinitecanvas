import {
  geometryBlobToSVGPath,
  getBlobBytes,
  nodeId,
  resolveGradientGeometry,
  resolveVectorNodePaths,
  type FigDocument,
  type FigNode,
  type FigPaint,
  type FigTransform,
} from "openfig-core";

type Guid = { sessionID: number; localID: number };

type Override = { path: string[]; props: FigNode };

type DrawCtx = {
  doc: FigDocument;
  ids: { next: (prefix: string) => string };
  defs: string[];
  pending: Override[];
  depth: number;
  stack: Set<string>;
  shallow: boolean;
};

const IDENTITY: FigTransform = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };

const SHAPE_TYPES = new Set([
  "RECTANGLE",
  "ROUNDED_RECTANGLE",
  "FRAME",
  "SECTION",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "SYMBOL",
  "SLIDE",
  "SHAPE_WITH_TEXT",
]);

const CLIP_TYPES = new Set(["FRAME", "SECTION", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SLIDE", "SYMBOL"]);

const VECTOR_TYPES = new Set(["VECTOR", "STAR", "POLYGON", "REGULAR_POLYGON", "BOOLEAN_OPERATION"]);

export type RenderedNode = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  svg: string;
};

export function renderTopLevel(
  doc: FigDocument,
  node: FigNode,
  options?: { transform?: FigTransform; shallow?: boolean },
): RenderedNode | null {
  const ctx = makeCtx(doc);
  ctx.shallow = Boolean(options?.shallow);
  let body = "";
  try {
    body = renderLocal(node, ctx);
  } catch {
    return null;
  }
  if (!body.trim()) return null;
  const pad = options?.shallow ? Math.min(96, Math.ceil(nodePad(node))) : subtreePad(doc, node);
  const placed = place(node, pad, options?.transform);
  if (placed.width < 1 || placed.height < 1) return null;
  const transform = placed.inner ? ` transform="${placed.inner}"` : "";
  const defs = ctx.defs.length ? `<defs>${ctx.defs.join("")}</defs>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${num(placed.width)}" height="${num(placed.height)}" viewBox="0 0 ${num(placed.width)} ${num(placed.height)}" fill="none">${defs}<g${transform}>${body}</g></svg>`;
  return {
    name: (node.name || "Frame").slice(0, 120),
    x: round3(placed.x),
    y: round3(placed.y),
    width: round3(placed.width),
    height: round3(placed.height),
    svg,
  };
}

function makeCtx(doc: FigDocument): DrawCtx {
  let n = 0;
  return {
    doc,
    ids: { next: (prefix) => `${prefix}${++n}` },
    defs: [],
    pending: [],
    depth: 0,
    stack: new Set(),
    shallow: false,
  };
}

function renderLocal(node: FigNode, ctx: DrawCtx): string {
  if (ctx.depth > 48 || node.phase === "REMOVED" || node.visible === false) return "";
  const { node: merged, childPending } = applyOverrides(node, ctx.pending);
  if (merged.visible === false) return "";
  const next: DrawCtx = { ...ctx, pending: childPending, depth: ctx.depth + 1, shallow: false };
  let body = "";
  try {
    body = ctx.shallow
      ? drawSelf(merged, next)
      : merged.type === "INSTANCE" && merged.symbolData?.symbolID
        ? renderInstance(merged, next)
        : `${drawSelf(merged, next)}${renderChildren(merged, next)}`;
  } catch {
    return "";
  }
  if (!body) return "";
  return wrap(merged, body, next);
}

function renderNode(node: FigNode, ctx: DrawCtx): string {
  const local = renderLocal(node, ctx);
  if (!local) return "";
  const transform = matrix(node.transform);
  return transform ? `<g transform="${transform}">${local}</g>` : local;
}

function renderInstance(node: FigNode, ctx: DrawCtx): string {
  const symbolId = gid(node.symbolData?.symbolID as Guid | undefined);
  const symbol = symbolId ? ctx.doc.nodeMap.get(symbolId) : undefined;
  const { w, h } = sizeOf(node);
  const self = drawSelf(node, ctx, w, h);
  if (!symbol || ctx.stack.has(symbolId)) return self;
  const extra = overridesFrom(node.symbolData?.symbolOverrides, symbolId);
  const nested = ctx.pending.map((ov) => ({
    path: ov.path[0] === symbolId ? ov.path.slice(1) : ov.path,
    props: ov.props,
  }));
  const inner = renderLocal(symbol, {
    ...ctx,
    pending: [...extra, ...nested],
    depth: ctx.depth + 1,
    stack: new Set([...ctx.stack, symbolId]),
  });
  const sw = symbol.size?.x || w || 1;
  const sh = symbol.size?.y || h || 1;
  const sx = w > 0 && sw > 0 ? w / sw : 1;
  const sy = h > 0 && sh > 0 ? h / sh : 1;
  const scaled =
    Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 ? inner : `<g transform="scale(${num(sx)} ${num(sy)})">${inner}</g>`;
  return `${self}${clipWrap(node, scaled, ctx, w, h)}`;
}

function renderChildren(node: FigNode, ctx: DrawCtx): string {
  const kids = childrenOf(ctx.doc, nodeId(node) || "");
  if (kids.length === 0) return "";
  const grouped = new Map<string, Override[]>();
  for (const ov of ctx.pending) {
    const head = ov.path[0];
    const child = kids.find((kid) => nodeId(kid) === head || gid(kid.overrideKey as Guid | undefined) === head);
    if (!child) continue;
    const id = nodeId(child) || "";
    const list = grouped.get(id) ?? [];
    list.push({ path: ov.path.slice(1), props: ov.props });
    grouped.set(id, list);
  }
  let maskId: string | null = null;
  const parts: string[] = [];
  for (const kid of kids) {
    if (kid.mask) {
      maskId = maskClip(kid, ctx) || maskId;
      continue;
    }
    const rendered = renderNode(kid, { ...ctx, pending: grouped.get(nodeId(kid) || "") ?? [] });
    if (!rendered) continue;
    parts.push(maskId ? `<g clip-path="url(#${maskId})">${rendered}</g>` : rendered);
  }
  const body = parts.join("");
  const { w, h } = sizeOf(node);
  if (node.type === "INSTANCE") return body;
  return clipWrap(node, body, ctx, w, h);
}

function drawSelf(node: FigNode, ctx: DrawCtx, width?: number, height?: number): string {
  const { w, h } = width == null ? sizeOf(node) : { w: width, h: height ?? 0 };
  if (node.type === "TEXT") return drawText(node, ctx, w);
  if (VECTOR_TYPES.has(node.type) && node.type !== "BOOLEAN_OPERATION") return drawGeometry(node, ctx, w, h, "both");
  const path = primitivePath(node, w, h);
  if (!path) return drawGeometry(node, ctx, w, h, "both");
  const fills = drawFills(path, paintsOf(node), ctx, w, h);
  const strokes = drawGeometry(node, ctx, w, h, "stroke") || drawPrimitiveStroke(node, path, ctx, w, h);
  return `${fills}${strokes}`;
}

type FigTextData = {
  characters?: string;
  glyphs?: Array<{ commandsBlob?: number; position?: { x: number; y: number }; fontSize?: number }>;
  baselines?: Array<{ position?: { x: number; y: number }; firstCharacter?: number; endCharacter?: number }>;
};

function textDataOf(node: FigNode): FigTextData {
  return (node.textData ?? {}) as FigTextData;
}

function drawText(node: FigNode, ctx: DrawCtx, w: number): string {
  const glyphs = (textDataOf(node).glyphs ?? []).filter((glyph) => typeof glyph?.commandsBlob === "number");
  if (glyphs.length > 0) {
    const paint = visiblePaints(node.fillPaints)[0];
    const fill = paint ? colorAttrs(paint) : { color: "#1c1917", opacity: 1 };
    const parts: string[] = [];
    for (const glyph of glyphs) {
      const bytes = getBlobBytes(ctx.doc, glyph.commandsBlob);
      if (!bytes) continue;
      let d = "";
      try {
        d = geometryBlobToSVGPath(bytes);
      } catch {
        continue;
      }
      if (!d) continue;
      d = cleanPath(d);
      const fontSize = glyph.fontSize || node.fontSize || 16;
      const em = pathLooksLikeEm(d);
      const scale = em ? fontSize : 1;
      const flip = em ? -scale : scale;
      const x = glyph.position?.x ?? 0;
      const y = glyph.position?.y ?? fontSize;
      parts.push(
        `<path d="${d}" fill="${fill.color}" fill-opacity="${num(fill.opacity)}" transform="translate(${num(x)} ${num(y)}) scale(${num(scale)} ${num(flip)})"/>`,
      );
    }
    if (parts.length > 0) return parts.join("");
  }
  return fallbackText(node, w);
}

function drawGeometry(node: FigNode, ctx: DrawCtx, w: number, h: number, kind: "both" | "stroke"): string {
  let resolved: ReturnType<typeof resolveVectorNodePaths>;
  try {
    resolved = resolveVectorNodePaths(ctx.doc, node);
  } catch {
    return "";
  }
  const parts: string[] = [];
  if (kind === "both") {
    for (const fill of resolved.fill) parts.push(drawFills(fill.svgPath, fill.paints as FigPaint[], ctx, w, h, fill.windingRule));
  }
  for (const stroke of resolved.stroke) {
    parts.push(drawFills(stroke.svgPath, (stroke.paints as FigPaint[]) || node.strokePaints, ctx, w, h, stroke.windingRule));
  }
  return parts.join("");
}

function drawFills(d: string, paints: FigPaint[] | undefined, ctx: DrawCtx, w: number, h: number, winding?: string): string {
  d = cleanPath(d);
  if (!d) return "";
  const rule = winding === "ODD" || winding === "EVENODD" ? ` fill-rule="evenodd"` : "";
  const ordered = visiblePaints(paints).slice().reverse();
  let out = "";
  for (const paint of ordered) {
    const blend = paintBlend(paint.blendMode);
    if (paint.type === "IMAGE") {
      out += drawImage(d, paint, ctx, w, h);
      continue;
    }
    if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL" || paint.type === "GRADIENT_ANGULAR" || paint.type === "GRADIENT_DIAMOND") {
      const id = gradientDef(paint, ctx, w, h);
      if (id) out += `<path d="${d}" fill="url(#${id})"${rule}${blend}/>`;
      continue;
    }
    const fill = colorAttrs(paint);
    out += `<path d="${d}" fill="${fill.color}" fill-opacity="${num(fill.opacity)}"${rule}${blend}/>`;
  }
  return out;
}

function drawImage(d: string, paint: FigPaint, ctx: DrawCtx, w: number, h: number): string {
  const bytes = imageBytes(ctx.doc, paint.image) || imageBytes(ctx.doc, paint.imageThumbnail);
  if (!bytes) return "";
  const id = ctx.ids.next("img");
  ctx.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${d}"/></clipPath>`);
  const href = `data:${imageMime(bytes)};base64,${Buffer.from(bytes).toString("base64")}`;
  const opacity = paint.opacity != null && paint.opacity < 0.999 ? ` opacity="${num(paint.opacity)}"` : "";
  return `<g clip-path="url(#${id})"${opacity}><image href="${href}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="${imageMatrix(paint.transform, w, h)}"/></g>`;
}

function drawPrimitiveStroke(node: FigNode, d: string, ctx: DrawCtx, w: number, h: number): string {
  const paint = visiblePaints(node.strokePaints)[0];
  const weight = node.strokeWeight || 0;
  if (!paint || weight <= 0 || node.type === "TEXT") return "";
  const fill = colorAttrs(paint);
  const cap = node.strokeCap === "ROUND" ? "round" : node.strokeCap === "SQUARE" ? "square" : "butt";
  const join = node.strokeJoin === "ROUND" ? "round" : node.strokeJoin === "BEVEL" ? "bevel" : "miter";
  const dash = Array.isArray(node.dashPattern) && node.dashPattern.length > 0 ? ` stroke-dasharray="${node.dashPattern.map((value) => num(Number(value))).join(" ")}"` : "";
  const common = `stroke="${fill.color}" stroke-opacity="${num(fill.opacity)}" stroke-linecap="${cap}" stroke-linejoin="${join}"${dash}`;
  if (node.strokeAlign === "INSIDE") {
    const id = ctx.ids.next("in");
    ctx.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${d}"/></clipPath>`);
    return `<g clip-path="url(#${id})"><path d="${d}" fill="none" ${common} stroke-width="${num(weight * 2)}"/></g>`;
  }
  if (node.strokeAlign === "OUTSIDE") {
    const id = ctx.ids.next("out");
    ctx.defs.push(
      `<mask id="${id}"><rect x="${num(-weight)}" y="${num(-weight)}" width="${num(w + weight * 2)}" height="${num(h + weight * 2)}" fill="white"/><path d="${d}" fill="black"/></mask>`,
    );
    return `<path d="${d}" fill="none" ${common} stroke-width="${num(weight * 2)}" mask="url(#${id})"/>`;
  }
  return `<path d="${d}" fill="none" ${common} stroke-width="${num(weight)}"/>`;
}

function fallbackText(node: FigNode, w: number): string {
  const characters = textDataOf(node).characters ?? "";
  if (!characters) return "";
  const paint = visiblePaints(node.fillPaints)[0];
  const fill = paint ? colorAttrs(paint) : { color: "#1c1917", opacity: 1 };
  const family = xml(node.fontName?.family || "Inter");
  const style = node.fontName?.style || "";
  const weight = /bold|black|heavy/i.test(style) ? 700 : /medium|semibold|demi/i.test(style) ? 600 : 400;
  const italic = /italic|oblique/i.test(style) ? "italic" : "normal";
  const fontSize = node.fontSize || 16;
  const baselines = textDataOf(node).baselines;
  const lines =
    Array.isArray(baselines) && baselines.length > 0
      ? baselines.map((line) => ({
          x: line.position?.x ?? 0,
          y: line.position?.y ?? fontSize,
          text: characters.slice(line.firstCharacter ?? 0, line.endCharacter ?? characters.length),
        }))
      : characters.split("\n").map((text, index) => ({ x: 0, y: fontSize * (index + 1), text }));
  const anchor = node.textAlignHorizontal === "CENTER" ? "middle" : node.textAlignHorizontal === "RIGHT" ? "end" : "start";
  const tspans = lines
    .map((line) => `<tspan x="${num(anchor === "middle" ? w / 2 : anchor === "end" ? w : line.x)}" y="${num(line.y)}">${xml(line.text)}</tspan>`)
    .join("");
  return `<text fill="${fill.color}" fill-opacity="${num(fill.opacity)}" font-family="${family}, Inter, sans-serif" font-size="${num(fontSize)}" font-weight="${weight}" font-style="${italic}" text-anchor="${anchor}">${tspans}</text>`;
}

function gradientDef(paint: FigPaint, ctx: DrawCtx, w: number, h: number): string | null {
  const stops = [...(paint.stops || [])].filter((stop) => stop?.color).sort((a, b) => a.position - b.position);
  if (stops.length === 0) return null;
  const kind = paint.type === "GRADIENT_RADIAL" || paint.type === "GRADIENT_DIAMOND" ? "radial" : "linear";
  const geometry = resolveGradientGeometry(
    { type: kind, transform: paint.transform ?? IDENTITY },
    w || 1,
    h || 1,
  );
  if (!geometry) return null;
  const id = ctx.ids.next("g");
  const stopTags = stops
    .map((stop) => {
      const fill = colorAttrs({ type: "SOLID", color: stop.color, opacity: 1 });
      return `<stop offset="${num(stop.position)}" stop-color="${fill.color}" stop-opacity="${num(fill.opacity)}"/>`;
    })
    .join("");
  if (geometry.type === "linear") {
    ctx.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(geometry.start.x)}" y1="${num(geometry.start.y)}" x2="${num(geometry.end.x)}" y2="${num(geometry.end.y)}">${stopTags}</linearGradient>`,
    );
    return id;
  }
  const rx = geometry.radiusX || 1;
  const ry = geometry.radiusY || rx;
  const angle = (geometry.angle * 180) / Math.PI;
  const transform =
    Math.abs(rx - ry) < 0.5 && Math.abs(angle) < 0.5
      ? ""
      : ` gradientTransform="rotate(${num(angle)} ${num(geometry.center.x)} ${num(geometry.center.y)}) translate(${num(geometry.center.x)} ${num(geometry.center.y)}) scale(1 ${num(ry / rx)}) translate(${num(-geometry.center.x)} ${num(-geometry.center.y)})"`;
  ctx.defs.push(
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(geometry.center.x)}" cy="${num(geometry.center.y)}" r="${num(rx)}"${transform}>${stopTags}</radialGradient>`,
  );
  return id;
}

function wrap(node: FigNode, body: string, ctx: DrawCtx): string {
  const { w, h } = sizeOf(node);
  const filter = shadowFilter(node, ctx, w, h);
  const opacity = typeof node.opacity === "number" && node.opacity < 0.999 ? ` opacity="${num(node.opacity)}"` : "";
  const blend = nodeBlend(node.blendMode as string | undefined);
  if (!filter && !opacity && !blend) return body;
  return `<g${opacity}${blend}${filter}>${body}</g>`;
}

function shadowFilter(node: FigNode, ctx: DrawCtx, w: number, h: number): string {
  const shadows = (node.effects || []).filter((effect) => effect && effect.visible !== false && effect.type === "DROP_SHADOW");
  if (shadows.length === 0 || (w <= 0 && h <= 0)) return "";
  const id = ctx.ids.next("sh");
  const primitives = shadows
    .map((effect) => {
      const fill = colorAttrs({ type: "SOLID", color: effect.color, opacity: effect.opacity ?? 1 });
      const blur = (effect.radius || 0) / 2;
      return `<feDropShadow dx="${num(effect.offset?.x || 0)}" dy="${num(effect.offset?.y || 0)}" stdDeviation="${num(blur)}" flood-color="${fill.color}" flood-opacity="${num(fill.opacity)}"/>`;
    })
    .join("");
  ctx.defs.push(`<filter id="${id}" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">${primitives}</filter>`);
  return ` filter="url(#${id})"`;
}

function clipWrap(node: FigNode, body: string, ctx: DrawCtx, w: number, h: number): string {
  if (!body || !CLIP_TYPES.has(node.type) || node.frameMaskDisabled === true || w <= 0 || h <= 0) return body;
  const id = ctx.ids.next("clip");
  ctx.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${rectPath(w, h, cornerRadii(node))}"/></clipPath>`);
  return `<g clip-path="url(#${id})">${body}</g>`;
}

function maskClip(node: FigNode, ctx: DrawCtx): string | null {
  const { w, h } = sizeOf(node);
  let geometry = "";
  if (node.fillGeometry?.length) {
    try {
      const resolved = resolveVectorNodePaths(ctx.doc, node);
      geometry = resolved.fill.map((fill) => `<path d="${cleanPath(fill.svgPath)}"/>`).join("");
    } catch {
      geometry = "";
    }
  }
  if (!geometry) {
    const d = primitivePath(node, w, h);
    if (d) geometry = `<path d="${d}"/>`;
  }
  if (!geometry) return null;
  const id = ctx.ids.next("mask");
  const transform = matrix(node.transform);
  const wrapped = transform ? `<g transform="${transform}">${geometry}</g>` : geometry;
  ctx.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${wrapped}</clipPath>`);
  return id;
}

function paintsOf(node: FigNode): FigPaint[] {
  if (node.type === "SHAPE_WITH_TEXT") {
    const overrides = node.nodeGenerationData?.overrides;
    if (Array.isArray(overrides)) {
      const shape = overrides.find((entry) => entry?.guidPath?.guids?.[0]?.sessionID === 40000000 && entry.guidPath.guids[0].localID === 0);
      if (shape?.fillPaints) return shape.fillPaints as FigPaint[];
    }
  }
  return [...(node.backgroundPaints || []), ...(node.fillPaints || [])];
}

function primitivePath(node: FigNode, w: number, h: number): string | null {
  if (node.type === "LINE") return w > 0 ? `M0 0L${num(w)} 0` : null;
  if (node.type === "ELLIPSE" || node.shapeWithTextType === "ELLIPSE") {
    if (w <= 0 || h <= 0) return null;
    return ellipsePath(w, h);
  }
  if (!SHAPE_TYPES.has(node.type) || w <= 0 || h <= 0) return null;
  return rectPath(w, h, cornerRadii(node));
}

function rectPath(w: number, h: number, radii: { tl: number; tr: number; br: number; bl: number }): string {
  const tl = clampRadius(radii.tl, w, h);
  const tr = clampRadius(radii.tr, w, h);
  const br = clampRadius(radii.br, w, h);
  const bl = clampRadius(radii.bl, w, h);
  if (tl + tr + br + bl < 0.05) return `M0 0H${num(w)}V${num(h)}H0Z`;
  return `M${num(tl)} 0H${num(w - tr)}A${num(tr)} ${num(tr)} 0 0 1 ${num(w)} ${num(tr)}V${num(h - br)}A${num(br)} ${num(br)} 0 0 1 ${num(w - br)} ${num(h)}H${num(bl)}A${num(bl)} ${num(bl)} 0 0 1 0 ${num(h - bl)}V${num(tl)}A${num(tl)} ${num(tl)} 0 0 1 ${num(tl)} 0Z`;
}

function ellipsePath(w: number, h: number): string {
  const rx = w / 2;
  const ry = h / 2;
  return `M${num(w)} ${num(ry)}A${num(rx)} ${num(ry)} 0 1 0 0 ${num(ry)}A${num(rx)} ${num(ry)} 0 1 0 ${num(w)} ${num(ry)}Z`;
}

function cornerRadii(node: FigNode) {
  if (node.rectangleCornerRadiiIndependent) {
    return {
      tl: Number(node.rectangleTopLeftCornerRadius) || 0,
      tr: Number(node.rectangleTopRightCornerRadius) || 0,
      br: Number(node.rectangleBottomRightCornerRadius) || 0,
      bl: Number(node.rectangleBottomLeftCornerRadius) || 0,
    };
  }
  const radius = Number(node.cornerRadius) || 0;
  return { tl: radius, tr: radius, br: radius, bl: radius };
}

function clampRadius(radius: number, w: number, h: number) {
  return Math.max(0, Math.min(radius, w / 2, h / 2));
}

function place(node: FigNode, pad: number, transform?: FigTransform) {
  const { w, h } = sizeOf(node);
  const height = node.type === "LINE" ? Math.max(h, node.strokeWeight || 1) : h;
  const t = transform ?? node.transform ?? IDENTITY;
  const pure =
    Math.abs(t.m00 - 1) < 1e-3 && Math.abs(t.m11 - 1) < 1e-3 && Math.abs(t.m01) < 1e-3 && Math.abs(t.m10) < 1e-3;
  if (pure) {
    return {
      x: t.m02 - pad,
      y: t.m12 - pad,
      width: w + pad * 2,
      height: height + pad * 2,
      inner: pad ? `translate(${num(pad)} ${num(pad)})` : "",
    };
  }
  const corners: Array<[number, number]> = [
    [-pad, -pad],
    [w + pad, -pad],
    [w + pad, height + pad],
    [-pad, height + pad],
  ];
  const pts = corners.map(([x, y]) => ({
    x: t.m00 * x + t.m01 * y + t.m02,
    y: t.m10 * x + t.m11 * y + t.m12,
  }));
  const minX = Math.min(...pts.map((pt) => pt.x));
  const minY = Math.min(...pts.map((pt) => pt.y));
  const maxX = Math.max(...pts.map((pt) => pt.x));
  const maxY = Math.max(...pts.map((pt) => pt.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    inner: `matrix(${num(t.m00)} ${num(t.m10)} ${num(t.m01)} ${num(t.m11)} ${num(t.m02 - minX)} ${num(t.m12 - minY)})`,
  };
}

function subtreePad(doc: FigDocument, node: FigNode, stack = new Set<string>()): number {
  let pad = nodePad(node);
  if (node.type === "INSTANCE") {
    const id = gid(node.symbolData?.symbolID as Guid | undefined);
    const symbol = id ? doc.nodeMap.get(id) : undefined;
    if (symbol && !stack.has(id)) {
      const next = new Set(stack);
      next.add(id);
      pad = Math.max(pad, subtreePad(doc, symbol, next));
    }
  }
  for (const child of childrenOf(doc, nodeId(node) || "")) pad = Math.max(pad, subtreePad(doc, child, stack));
  return Math.min(96, Math.ceil(pad));
}

function nodePad(node: FigNode) {
  let pad = 0;
  for (const effect of node.effects || []) {
    if (!effect || effect.visible === false) continue;
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
      pad = Math.max(pad, Math.abs(effect.offset?.x || 0) + Math.abs(effect.offset?.y || 0) + (effect.radius || 0) + (effect.spread || 0));
    }
  }
  if (node.strokeWeight && node.strokeAlign !== "INSIDE") pad = Math.max(pad, node.strokeWeight);
  return pad + (pad > 0 ? 2 : 0);
}

function childrenOf(doc: FigDocument, id: string) {
  const kids = doc.childrenMap.get(id) || [];
  return kids
    .filter((node) => node.phase !== "REMOVED" && node.visible !== false)
    .sort((a, b) => {
      const left = a.parentIndex?.position || "";
      const right = b.parentIndex?.position || "";
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });
}

function applyOverrides(node: FigNode, pending: Override[]) {
  const id = nodeId(node) || "";
  const key = gid(node.overrideKey as Guid | undefined);
  const props: FigNode[] = [];
  const childPending: Override[] = [];
  for (const ov of pending) {
    let path = ov.path;
    if (path[0] === id || (key && path[0] === key)) path = path.slice(1);
    if (path.length === 0) props.push(ov.props);
    else childPending.push({ path, props: ov.props });
  }
  return { node: mergeVisual(node, props), childPending };
}

function overridesFrom(value: unknown, symbolId: string): Override[] {
  if (!Array.isArray(value)) return [];
  return value.map((props) => {
    const path = pathIds(props?.guidPath).filter((id, index) => !(index === 0 && id === symbolId));
    return { path, props: props as FigNode };
  });
}

function mergeVisual(node: FigNode, layers: FigNode[]): FigNode {
  if (layers.length === 0) return node;
  const next: FigNode = { ...node };
  for (const props of layers) {
    if (props.fillPaints) next.fillPaints = props.fillPaints;
    if (props.strokePaints) next.strokePaints = props.strokePaints;
    if (props.backgroundPaints) next.backgroundPaints = props.backgroundPaints;
    if (props.effects) next.effects = props.effects;
    if (typeof props.opacity === "number") next.opacity = props.opacity;
    if (typeof props.visible === "boolean") next.visible = props.visible;
    if (props.fontName) next.fontName = props.fontName;
    if (typeof props.fontSize === "number") next.fontSize = props.fontSize;
    if (typeof props.strokeWeight === "number") next.strokeWeight = props.strokeWeight;
    if (typeof props.cornerRadius === "number") next.cornerRadius = props.cornerRadius;
    if (props.size && node.type !== "SYMBOL" && node.type !== "COMPONENT") next.size = props.size;
    if (props.textData?.characters != null) {
      const characters = String(props.textData.characters);
      const same = characters === node.textData?.characters;
      next.textData = same ? { ...node.textData, ...props.textData } : { characters };
    }
  }
  return next;
}

function pathIds(guidPath: { guids?: Guid[] } | undefined) {
  return (guidPath?.guids || []).map((guid) => gid(guid)).filter(Boolean);
}

function visiblePaints(paints: FigPaint[] | undefined) {
  return (paints || []).filter((paint) => paint && paint.visible !== false && (paint.opacity ?? 1) > 0);
}

function colorAttrs(paint: FigPaint) {
  const color = paint.color || { r: 0, g: 0, b: 0, a: 1 };
  const opacity = Math.max(0, Math.min(1, (color.a ?? 1) * (paint.opacity ?? 1)));
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
  return { color: `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`, opacity };
}

function imageBytes(doc: FigDocument, image: FigPaint["image"] | undefined) {
  if (!image) return null;
  if (typeof image.dataBlob === "number") {
    const bytes = getBlobBytes(doc, image.dataBlob);
    if (bytes?.length) return bytes;
  }
  const hex = hashHex(image.hash);
  if (hex && doc.images.has(hex)) return doc.images.get(hex) ?? null;
  if (typeof image.name === "string" && doc.images.has(image.name)) return doc.images.get(image.name) ?? null;
  return null;
}

function hashHex(hash: unknown) {
  const bytes = hashBytes(hash);
  if (!bytes) return "";
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hashBytes(hash: unknown): Uint8Array | null {
  if (!hash) return null;
  if (hash instanceof Uint8Array) return hash;
  if (typeof hash === "object") {
    const values = Object.values(hash as Record<string, unknown>);
    if (values.length > 0 && values.every((value) => typeof value === "number")) return Uint8Array.from(values as number[]);
  }
  return null;
}

function imageMime(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes.length > 11 && bytes[0] === 0x52 && bytes[8] === 0x57) return "image/webp";
  return "image/png";
}

function imageMatrix(transform: FigTransform | undefined, w: number, h: number) {
  const t = transform ?? IDENTITY;
  const det = t.m00 * t.m11 - t.m01 * t.m10;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return `matrix(${num(w)} 0 0 ${num(h)} 0 0)`;
  const a = t.m11 / det;
  const b = -t.m10 / det;
  const c = -t.m01 / det;
  const d = t.m00 / det;
  const e = (t.m01 * t.m12 - t.m11 * t.m02) / det;
  const f = (t.m10 * t.m02 - t.m00 * t.m12) / det;
  return `matrix(${num(a * w)} ${num(b * h)} ${num(c * w)} ${num(d * h)} ${num(e * w)} ${num(f * h)})`;
}

function matrix(transform?: FigTransform) {
  if (!transform) return "";
  const t = transform;
  const pure =
    Math.abs(t.m00 - 1) < 1e-4 &&
    Math.abs(t.m11 - 1) < 1e-4 &&
    Math.abs(t.m01) < 1e-4 &&
    Math.abs(t.m10) < 1e-4 &&
    Math.abs(t.m02) < 1e-4 &&
    Math.abs(t.m12) < 1e-4;
  if (pure) return "";
  return `matrix(${num(t.m00)} ${num(t.m10)} ${num(t.m01)} ${num(t.m11)} ${num(t.m02)} ${num(t.m12)})`;
}

function nodeBlend(mode?: string) {
  const value = blendMode(mode);
  return value ? ` style="mix-blend-mode:${value}"` : "";
}

function paintBlend(mode?: string) {
  const value = blendMode(mode);
  return value ? ` style="mix-blend-mode:${value}"` : "";
}

function blendMode(mode?: string) {
  if (!mode || mode === "NORMAL" || mode === "PASS_THROUGH") return "";
  const mapped: Record<string, string> = {
    MULTIPLY: "multiply",
    SCREEN: "screen",
    OVERLAY: "overlay",
    DARKEN: "darken",
    LIGHTEN: "lighten",
    COLOR_DODGE: "color-dodge",
    COLOR_BURN: "color-burn",
    HARD_LIGHT: "hard-light",
    SOFT_LIGHT: "soft-light",
    DIFFERENCE: "difference",
    EXCLUSION: "exclusion",
    HUE: "hue",
    SATURATION: "saturation",
    COLOR: "color",
    LUMINOSITY: "luminosity",
  };
  return mapped[mode] || "";
}

function cleanPath(d: string) {
  return d.replace(/^Z+/, "");
}

function pathLooksLikeEm(d: string) {
  const values = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  let max = 0;
  for (const value of values) max = Math.max(max, Math.abs(Number(value)));
  return max > 0 && max < 8;
}

function sizeOf(node: FigNode) {
  return { w: Math.max(0, node.size?.x || 0), h: Math.max(0, node.size?.y || 0) };
}

function gid(guid?: Guid | null) {
  if (!guid || typeof guid.sessionID !== "number" || typeof guid.localID !== "number") return "";
  return `${guid.sessionID}:${guid.localID}`;
}

function xml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&apos;";
  });
}

function num(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return "0";
  return String(rounded);
}

function round3(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}
