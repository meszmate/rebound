/*
 * Rebound Relay (Figma), plugin entry (sandbox / main thread).
 *
 * Shows the UI, reports the live selection, and on request builds the Rebound IR
 * from the current selection and hands it to the UI, which ships it to After
 * Effects (or saves a .rbir file). All scene-graph and image access happens here;
 * all network / file output happens in the UI iframe.
 */
figma.showUI(__html__, { width: 340, height: 480, title: 'Rebound Relay', themeColors: true });

function postSelection() {
  var sel = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'selection', count: sel.length });
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
      var ir = await ReboundFigma.buildIR(sel);
      figma.ui.postMessage({ type: 'ir', ir: ir });
    } catch (e) {
      figma.ui.postMessage({ type: 'error', error: (e && e.message) || String(e) });
    }
  } else if (msg.type === 'notify') {
    figma.notify(msg.message || '', { error: !!msg.error });
  } else if (msg.type === 'resize') {
    figma.ui.resize(340, Math.max(320, Math.min(720, msg.height || 480)));
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};
