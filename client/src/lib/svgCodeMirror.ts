import { css, cssLanguage } from '@codemirror/lang-css'
import { xml, xmlLanguage } from '@codemirror/lang-xml'
import { LanguageSupport } from '@codemirror/language'
import { parseMixed, type Input, type SyntaxNodeRef } from '@lezer/common'

function elementName(node: SyntaxNodeRef, input: Input): string | null {
  const element = node.node
  if (element.name !== 'Element') return null
  const tagName = element.getChild('OpenTag')?.getChild('TagName')
  return tagName ? input.read(tagName.from, tagName.to).replace(/^.*:/, '').toLowerCase() : null
}

/**
 * Configure the stock XML language in place. Re-defining via `LRLanguage.define`
 * and passing `xmlLanguage.data` (a Facet, not a config object) drops
 * `commentTokens`, so Mod-/ `toggleComment` becomes a no-op.
 */
export const svgLanguage = xmlLanguage.configure({
  wrap: parseMixed((node, input) => {
    if (elementName(node, input) !== 'style') return null
    return {
      parser: cssLanguage.parser,
      overlay: (child) => {
        if (child.name === 'Text') return true
        if (child.name !== 'Cdata') return false
        return {
          from: child.from + '<![CDATA['.length,
          to: child.to - ']]>'.length,
        }
      },
    }
  }),
})

/** XML language support with CSS mounted inside SVG style elements. */
export function svg(): LanguageSupport {
  return new LanguageSupport(svgLanguage, [xml().support, css().support])
}
