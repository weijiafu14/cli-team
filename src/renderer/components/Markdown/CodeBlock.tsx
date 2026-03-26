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
import { Button, Message } from '@arco-design/web-react';
import { Copy, Down, FullScreen, OffScreen, Up } from '@icon-park/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatCode, getDiffLineStyle, logicRender } from './markdownUtils';

const DEFAULT_MERMAID_SCALE = 1.75;
const MIN_MERMAID_SCALE = 0.5;
const MAX_MERMAID_SCALE = 4;

function clampMermaidScale(nextScale: number): number {
  return Math.min(Math.max(nextScale, MIN_MERMAID_SCALE), MAX_MERMAID_SCALE);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function MermaidFullscreenOverlay({ svgContent, onClose }: { svgContent: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(DEFAULT_MERMAID_SCALE);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomLevel = `${Math.round(scale * 100)}%`;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => clampMermaidScale(prev + delta));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === containerRef.current || containerRef.current?.contains(e.target as Node)) {
        isDragging.current = true;
        dragStart.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
      }
    },
    [translate]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setTranslate({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const resetView = useCallback(() => {
    setScale(DEFAULT_MERMAID_SCALE);
    setTranslate({ x: 0, y: 0 });
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      data-testid='mermaid-fullscreen-overlay'
      role='dialog'
      aria-modal='true'
      aria-label={t('messages.mermaid.previewTitle')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isDragging.current ? 'grabbing' : 'grab',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          zIndex: 10001,
          width: 'min(96vw, 1200px)',
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid var(--bg-3)',
          background: 'var(--bg-1)',
          color: 'var(--text-primary)',
          flexWrap: 'wrap',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{t('messages.mermaid.previewTitle')}</span>
          <span data-testid='mermaid-zoom-level' style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {zoomLevel}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Button
            size='small'
            data-testid='mermaid-zoom-out-button'
            aria-label={t('messages.mermaid.zoomOut')}
            title={t('messages.mermaid.zoomOut')}
            onClick={(e) => {
              e.stopPropagation();
              setScale((prev) => clampMermaidScale(prev - 0.25));
            }}
          >
            -
          </Button>
          <Button
            size='small'
            data-testid='mermaid-zoom-in-button'
            aria-label={t('messages.mermaid.zoomIn')}
            title={t('messages.mermaid.zoomIn')}
            onClick={(e) => {
              e.stopPropagation();
              setScale((prev) => clampMermaidScale(prev + 0.25));
            }}
          >
            +
          </Button>
          <Button
            size='small'
            onClick={(e) => {
              e.stopPropagation();
              resetView();
            }}
          >
            {t('messages.mermaid.resetZoom')}
          </Button>
          <Button
            size='small'
            data-testid='mermaid-close-button'
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <OffScreen theme='outline' size='16' />
              {t('common.close')}
            </span>
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        data-testid='mermaid-fullscreen-canvas'
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isDragging.current ? 'none' : 'transform 0.1s ease-out',
          background: 'var(--bg-1, #fff)',
          borderRadius: 12,
          padding: 24,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'visible',
          marginTop: 56,
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    </div>,
    document.body
  );
}

const MermaidBlock = ({ chart, theme }: { chart: string; theme: 'light' | 'dark' }) => {
  const { t } = useTranslation();
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [fullscreen, setFullscreen] = useState(false);
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
        .catch((error: unknown) => {
          if (isMounted) {
            setError(getErrorMessage(error));
          }
        });
    } catch (error: unknown) {
      if (isMounted) {
        setError(getErrorMessage(error));
      }
    }
    return () => {
      isMounted = false;
    };
  }, [chart, theme, mermaidId]);

  return (
    <>
      <div
        style={{
          padding: '16px',
          background: 'var(--bg-1)',
          borderRadius: '8px',
          overflowX: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          border: '1px solid var(--bg-3)',
          zIndex: 10001,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {t('messages.mermaid.previewTitle')}
          </span>
          <Button
            size='mini'
            type='secondary'
            data-testid='mermaid-expand-button'
            disabled={!svgContent}
            onClick={() => setFullscreen(true)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FullScreen theme='outline' size='14' />
              {t('messages.mermaid.expand')}
            </span>
          </Button>
        </div>
        <div
          style={{
            overflowX: 'auto',
            display: 'flex',
            justifyContent: 'center',
            borderRadius: '8px',
            position: 'relative',
          }}
        >
          {error ? (
            <div style={{ color: 'var(--color-danger-6)', textAlign: 'left', width: '100%' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{t('messages.mermaid.syntaxErrorTitle')}</div>
              <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error}</pre>
            </div>
          ) : svgContent ? (
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          ) : (
            <div style={{ color: 'var(--text-3)' }}>{t('messages.mermaid.rendering')}</div>
          )}
        </div>
      </div>
      {fullscreen && svgContent && (
        <MermaidFullscreenOverlay svgContent={svgContent} onClose={() => setFullscreen(false)} />
      )}
    </>
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
