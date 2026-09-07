import { css, cssLanguage } from '@codemirror/lang-css'
import { xml, xmlLanguage } from '@codemirror/lang-xml'
import { LanguageSupport, LRLanguage } from '@codemirror/language'
import { parseMixed, type Input, type SyntaxNodeRef } from '@lezer/common'

function elementName(node: SyntaxNodeRef, input: Input): string | null {
  const element = node.node
  if (element.name !== 'Element') return null
  const tagName = element.getChild('OpenTag')?.getChild('TagName')
  return tagName ? input.read(tagName.from, tagName.to).replace(/^.*:/, '').toLowerCase() : null
}

const svgParser = xmlLanguage.parser.configure({
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
export const svgLanguage = LRLanguage.define({
  name: 'svg',
  parser: svgParser,
  languageData: xmlLanguage.data,
})

export function svg(): LanguageSupport {
  return new LanguageSupport(svgLanguage, [xml().support, css().support])
}
