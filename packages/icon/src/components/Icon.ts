import type { HTMLAttributes } from "../types";
import { iconViewBox, resolveIcon, resolveIconAsync } from "../registry";

export interface Props extends HTMLAttributes<"svg"> {
  /** The name of the icon to include */
  name: string;
  /** SVG class shorthand */
  class?: string;
  /** SVG className shorthand */
  className?: string;
  /** Shorthand for including a <title>{props.title}</title> element in the SVG */
  title?: string;
  /** Shorthand for including a <desc>{props.desc}</desc> element in the SVG */
  desc?: string;
  /** Shorthand for setting width and height */
  size?: number | string;
  width?: number | string;
  height?: number | string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_WRAPPER = `<svg xmlns="${SVG_NS}">%BODY%</svg>`;

function appendIconBody(svg: SVGSVGElement, body: string): void {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(
    SVG_WRAPPER.replace("%BODY%", body),
    "image/svg+xml"
  );
  const parsedSvg = parsed.documentElement;
  while (parsedSvg.firstChild) {
    svg.appendChild(document.importNode(parsedSvg.firstChild, true));
    parsedSvg.removeChild(parsedSvg.firstChild);
  }
}

export function Icon(props: Props): SVGSVGElement {
  const {
    name,
    title,
    desc,
    size,
    width,
    height,
    ...rest
  } = props;

  const icon = resolveIcon(name);
  const svg = document.createElementNS(SVG_NS, "svg");

  const resolvedWidth = width ?? size;
  const resolvedHeight = height ?? size;

  if (resolvedWidth != null) {
    svg.setAttribute("width", String(resolvedWidth));
  }
  if (resolvedHeight != null) {
    svg.setAttribute("height", String(resolvedHeight));
  }

  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", title || desc ? "false" : "true");
  svg.setAttribute("role", "img");

  if (icon) {
    svg.setAttribute("viewBox", iconViewBox(icon));
    appendIconBody(svg, icon.body);
  } else {
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("data-missing-icon", name);
    void resolveIconAsync(name).then((resolved) => {
      if (!resolved) return;
      if (svg.getAttribute("data-missing-icon") !== name) return;
      svg.removeAttribute("data-missing-icon");
      svg.setAttribute("viewBox", iconViewBox(resolved));
      appendIconBody(svg, resolved.body);
    });
  }

  for (const [key, value] of Object.entries(rest)) {
    if (value == null || key === "ref" || key === "on") continue;

    if (key === "className") {
      svg.setAttribute("class", String(value));
      continue;
    }

    if (key === "style" && typeof value === "object") {
      Object.assign((svg as unknown as SVGElement).style, value);
      continue;
    }

    svg.setAttribute(key, String(value));
  }

  if (typeof title === "string" && title.length > 0) {
    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = title;
    svg.appendChild(titleEl);
  }

  if (typeof desc === "string" && desc.length > 0) {
    const descEl = document.createElementNS(SVG_NS, "desc");
    descEl.textContent = desc;
    svg.appendChild(descEl);
  }

  return svg;
}
