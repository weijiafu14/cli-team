/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import katex from 'katex';
import mermaid from 'mermaid';

import { copyText } from '@/renderer/utils/ui/clipboard';
import { Message } from '@arco-design/web-react';
import { Copy, Down, Up } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCode, getDiffLineStyle, logicRender } from './markdownUtils';

const MermaidBlock = ({ chart, theme }: { chart: string; theme: 'light' | 'dark' }) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const mermaidId = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  React.useEffect(() => {
    let isMounted = true;
    try {
      mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' });
      mermaid
        .render(mermaidId, chart)
        .then((result) => {
          if (isMounted) {
            setSvgContent(result.svg);
            setError('');
          }
        })
        .catch((e) => {
          if (isMounted) {
            setError(e.message || String(e));
          }
        });
    } catch (e: any) {
      if (isMounted) {
        setError(e.message || String(e));
      }
    }
    return () => {
      isMounted = false;
    };
  }, [chart, theme, mermaidId]);

  return (
    <div
      style={{
        padding: '16px',
        background: 'var(--bg-1)',
        borderRadius: '8px',
        overflowX: 'auto',
        display: 'flex',
        justifyContent: 'center',
        border: '1px solid var(--bg-3)',
      }}
    >
      {error ? (
        <div style={{ color: 'var(--color-danger-6)', textAlign: 'left', width: '100%' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Mermaid Syntax Error:</div>
          <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error}</pre>
        </div>
      ) : svgContent ? (
        <div dangerouslySetInnerHTML={{ __html: svgContent }} />
      ) : (
        <div style={{ color: 'var(--text-3)' }}>Rendering diagram...</div>
      )}
    </div>
  );
};

type CodeBlockProps = {
  children: string;
  className?: string;
  node?: unknown;
  hiddenCodeCopyButton?: boolean;
  codeStyle?: React.CSSProperties;
  [key: string]: unknown;
};

function CodeBlock(props: CodeBlockProps) {
  const { t } = useTranslation();
  const [fold, setFlow] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  React.useEffect(() => {
    const updateTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  return useMemo(() => {
    const {
      children,
      className,
      node: _node,
      hiddenCodeCopyButton: _hiddenCodeCopyButton,
      codeStyle: _codeStyle,
      ...rest
    } = props;
    const match = /language-(\w+)/.exec(className || '');
    const language = match?.[1] || 'text';
    const codeTheme = currentTheme === 'dark' ? vs2015 : vs;

    // Render latex/math code blocks as KaTeX display math
    // Skip full LaTeX documents (with \documentclass, \begin{document}, etc.) — KaTeX only handles math
    if (language === 'latex' || language === 'math' || language === 'tex') {
      const latexSource = String(children).replace(/\n$/, '');
      const isFullDocument = /\\(documentclass|begin\{document\}|usepackage)\b/.test(latexSource);
      if (!isFullDocument) {
        try {
          const html = katex.renderToString(latexSource, {
            displayMode: true,
            throwOnError: false,
          });
          return <div className='katex-display' dangerouslySetInnerHTML={{ __html: html }} />;
        } catch {
          // Fall through to render as code block if KaTeX fails
        }
      }
    }

    if (language === 'mermaid') {
      return <MermaidBlock chart={String(children)} theme={currentTheme} />;
    }

    if (!String(children).includes('\n')) {
      return (
        <code
          {...rest}
          className={className}
          style={{
            fontWeight: 'bold',
          }}
        >
          {children}
        </code>
      );
    }

    const isDiff = language === 'diff';
    const formattedContent = formatCode(children);
    const diffLines = isDiff ? formattedContent.split('\n') : [];

    return (
      <div style={{ width: '100%', minWidth: 0, maxWidth: '100%', ...props.codeStyle }}>
        <div
          style={{
            border: '1px solid var(--bg-3)',
            borderRadius: '0.3rem',
            overflow: 'hidden',
            overflowX: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-2)',
              borderTopLeftRadius: '0.3rem',
              borderTopRightRadius: '0.3rem',
              borderBottomLeftRadius: fold ? '0.3rem' : '0',
              borderBottomRightRadius: fold ? '0.3rem' : '0',
              padding: '6px 10px',
              borderBottom: !fold ? '1px solid var(--bg-3)' : undefined,
            }}
          >
            <span
              style={{
                textDecoration: 'none',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                lineHeight: '20px',
              }}
            >
              {'<' + language.toLocaleLowerCase() + '>'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Copy code button */}
              <Copy
                theme='outline'
                size='18'
                style={{ cursor: 'pointer' }}
                fill='var(--text-secondary)'
                onClick={() => {
                  void copyText(formatCode(children))
                    .then(() => {
                      Message.success(t('common.copySuccess'));
                    })
                    .catch(() => {
                      Message.error(t('common.copyFailed'));
                    });
                }}
              />
              {/* Fold/unfold button */}
              {logicRender(
                !fold,
                <Up
                  theme='outline'
                  size='20'
                  style={{ cursor: 'pointer' }}
                  fill='var(--text-secondary)'
                  onClick={() => setFlow(true)}
                />,
                <Down
                  theme='outline'
                  size='20'
                  style={{ cursor: 'pointer' }}
                  fill='var(--text-secondary)'
                  onClick={() => setFlow(false)}
                />
              )}
            </div>
          </div>
          {logicRender(
            !fold,
            <>
              <SyntaxHighlighter
                children={formattedContent}
                language={language}
                style={codeTheme}
                PreTag='div'
                wrapLines={isDiff}
                lineProps={
                  isDiff
                    ? (lineNumber: number) => ({
                        style: {
                          display: 'block',
                          ...getDiffLineStyle(diffLines[lineNumber - 1] || '', currentTheme === 'dark'),
                        },
                      })
                    : undefined
                }
                customStyle={{
                  marginTop: '0',
                  margin: '0',
                  borderTopLeftRadius: '0',
                  borderTopRightRadius: '0',
                  borderBottomLeftRadius: '0',
                  borderBottomRightRadius: '0',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  overflowX: 'auto',
                  maxWidth: '100%',
                }}
                codeTagProps={{
                  style: {
                    color: 'var(--text-primary)',
                  },
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-2)',
                  borderBottomLeftRadius: '0.3rem',
                  borderBottomRightRadius: '0.3rem',
                  padding: '6px 10px',
                  borderTop: '1px solid var(--bg-3)',
                }}
              >
                <Up
                  theme='outline'
                  size='20'
                  style={{ cursor: 'pointer' }}
                  fill='var(--text-secondary)'
                  onClick={() => setFlow(true)}
                  title={t('common.collapse', '收起')}
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }, [props, currentTheme, fold, t]);
}

export default CodeBlock;
