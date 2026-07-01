/*
 * Rebound Relay (Figma), plugin entry (sandbox / main thread).
 *
 * Shows the UI, reports the live selection, and on request builds the Rebound IR
 * from the current selection and hands it to the UI, which ships it to After
 * Effects (or saves a .rbir file). All scene-graph and image access happens here;
 * all network / file output happens in the UI iframe.
 */
figma.showUI(__html__, { width: 340, height: 300, title: 'Rebound Relay', themeColors: true });

// Tell the UI which IR version we emit, so it can warn on receiver version skew.
figma.ui.postMessage({ type: 'meta', irVersion: ReboundFigma.irVersion });

// Count visible descendants so the UI can warn BEFORE a huge selection floods
// the After Effects timeline (each node becomes ~one layer). Cheap scene-graph
// walk; hidden nodes are excluded because the importer skips them.
function countNodes(nodes) {
  var n = 0;
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (!node || node.visible === false) continue;
    n++;
    if (node.children && node.children.length) n += countNodes(node.children);
  }
  return n;
}

function postSelection() {
  var sel = figma.currentPage.selection;
  var total = 0;
  try { total = countNodes(sel); } catch (e) { total = sel.length; }
  figma.ui.postMessage({ type: 'selection', count: sel.length, total: total });
}

figma.on('selectionchange', postSelection);
postSelection();

figma.ui.onmessage = async function (msg) {
  if (!msg) return;
  if (msg.type === 'export') {
    var sel = figma.currentPage.selection;
    if (!sel.length) {
      figma.ui.postMessage({ type: 'error', error: 'Select a frame or some layers to send.' });
      return;
    }
    try {
      var ir = await ReboundFigma.buildIR(sel, msg.options || {});
      figma.ui.postMessage({ type: 'ir', ir: ir });
    } catch (e) {
      figma.ui.postMessage({ type: 'error', error: (e && e.message) || String(e) });
    }
  } else if (msg.type === 'notify') {
    figma.notify(msg.message || '', { error: !!msg.error });
  } else if (msg.type === 'resize') {
    // The UI hugs its content; clamp to sane bounds so a state change never
    // leaves dead space or clips the report.
    figma.ui.resize(340, Math.max(240, Math.min(640, msg.height || 300)));
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};
