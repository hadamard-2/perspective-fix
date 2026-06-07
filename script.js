/**
 * PerspectiveFix Pro - Modular Architecture (Fixed)
 * @version 2.0.1
 * @author Oathan Rex
 * @license MIT
 */

(function () {
    'use strict';

    // ============================================
    // MODULE: Configuration
    // ============================================
    var Config = (function () {
        var _supportsOffscreenCanvas = (function () {
            try {
                if (typeof OffscreenCanvas === 'undefined') return false;
                var test = new OffscreenCanvas(1, 1);
                var ctx = test.getContext('2d');
                return ctx !== null;
            } catch (e) {
                return false;
            }
        })();

        var _supportsImageBitmap = typeof createImageBitmap === 'function';

        return Object.freeze({
            // Processing limits
            MAX_INPUT_PIXELS: 100000000,
            MAX_OUTPUT_DIMENSION: 4096,
            MAX_OUTPUT_PIXELS: 16000000,

            // Timing
            WORKER_TIMEOUT_MS: 15000,
            DRAG_THROTTLE_MS: 50,
            PREVIEW_DEBOUNCE_MS: 50,
            RESIZE_DEBOUNCE_MS: 200,
            DOWNLOAD_THROTTLE_MS: 1000,


            // UI
            CORNER_STEP: 2,
            CORNER_STEP_FAST: 10,
            MAX_PREVIEW_SIZE: 480,
            CORNER_MARGIN_RATIO: 0.1,
            MIN_CANVAS_SIZE: 50, // Minimum canvas dimension
            CONTAINER_PADDING: 32, // Padding for container calculations
            MAX_HEIGHT_VIEWPORT_RATIO: 0.5, // Max height as fraction of viewport
            MAX_ASPECT_RATIO: 10, // Maximum allowed aspect ratio (width:height or height:width)
            MAX_FILE_SIZE_MB: 50, // Maximum file size for paste operations in MB

            // Feature flags
            supportsOffscreenCanvas: _supportsOffscreenCanvas,
            supportsImageBitmap: _supportsImageBitmap,

            // Corner labels for accessibility
            CORNER_LABELS: Object.freeze(['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left']),

            // Multi-crop
            MAX_CROPS: 2,
            CROP_COLORS: Object.freeze(['#10b981', '#6366f1']) // green, indigo
        });
    })();

    // ============================================
    // MODULE: Utilities
    // ============================================
    var Utils = (function () {
        function debounce(func, wait) {
            var timeout = null;
            return function () {
                var context = this;
                var args = arguments;
                if (timeout !== null) {
                    clearTimeout(timeout);
                }
                timeout = setTimeout(function () {
                    timeout = null;
                    func.apply(context, args);
                }, wait);
            };
        }

        function throttle(func, limit) {
            var lastCall = 0;
            var lastResult;
            return function () {
                var now = Date.now();
                if (now - lastCall >= limit) {
                    lastCall = now;
                    lastResult = func.apply(this, arguments);
                }
                return lastResult;
            };
        }

        function dist(a, b) {
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function crossProduct2D(o, a, b) {
            return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        }

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function deepClone(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) {
                var arrClone = [];
                for (var i = 0; i < obj.length; i++) {
                    arrClone[i] = deepClone(obj[i]);
                }
                return arrClone;
            }
            var clone = {};
            for (var key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    clone[key] = deepClone(obj[key]);
                }
            }
            return clone;
        }

        var idCounter = 0;
        function uniqueId(prefix) {
            idCounter++;
            return (prefix || 'id') + '_' + idCounter + '_' + Date.now();
        }

        function isValidNumber(val) {
            return typeof val === 'number' && !isNaN(val) && isFinite(val);
        }

        function getFileExtension(filename) {
            if (!filename || typeof filename !== 'string') return '';
            var lastDot = filename.lastIndexOf('.');
            if (lastDot === -1 || lastDot === filename.length - 1) return '';
            return filename.substring(lastDot + 1).toLowerCase();
        }

        return Object.freeze({
            debounce: debounce,
            throttle: throttle,
            dist: dist,
            crossProduct2D: crossProduct2D,
            clamp: clamp,
            deepClone: deepClone,
            uniqueId: uniqueId,
            isValidNumber: isValidNumber,
            getFileExtension: getFileExtension
        });
    })();

    // ============================================
    // MODULE: DOM Manager
    // ============================================
    var DOM = (function () {
        var elements = {};
        var listeners = [];

        var elementIds = [
            'uploadZone', 'fileInput', 'errorMsg',
            'editor', 'srcCanvas',
            'quadSvg', 'corners', 'origDim', 'origFileName',
            'newBtn', 'addCropBtn', 'downloadBtn',
            'downloadIcon', 'downloadText', 'origContainer',
            'canvasWrap', 'cropTabs', 'previewCards', 'zoomLens',
            'editPanel', 'fullscreenBtn'
        ];

        var criticalIds = [
            'uploadZone', 'fileInput', 'srcCanvas', 'previewCards',
            'corners', 'quadSvg', 'downloadBtn'
        ];

        function init() {
            elements = {};
            for (var i = 0; i < elementIds.length; i++) {
                var id = elementIds[i];
                elements[id] = document.getElementById(id);
            }
            return validate();
        }

        function validate() {
            var missing = [];
            for (var i = 0; i < criticalIds.length; i++) {
                var id = criticalIds[i];
                if (!elements[id]) {
                    missing.push(id);
                }
            }

            if (missing.length > 0) {
                console.error('Critical elements missing:', missing.join(', '));
                return { success: false, missing: missing };
            }

            return { success: true, missing: [] };
        }

        function get(id) {
            if (elements[id] !== undefined) {
                return elements[id];
            }
            return document.getElementById(id);
        }

        function create(tag, attrs, children) {
            var el = document.createElement(tag);

            if (attrs) {
                for (var key in attrs) {
                    if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
                    var value = attrs[key];

                    if (key === 'className') {
                        el.className = value;
                    } else if (key === 'style' && typeof value === 'object') {
                        for (var styleKey in value) {
                            if (Object.prototype.hasOwnProperty.call(value, styleKey)) {
                                el.style[styleKey] = value[styleKey];
                            }
                        }
                    } else if (key.indexOf('data-') === 0 || key.indexOf('aria-') === 0 || key === 'role' || key === 'tabindex') {
                        el.setAttribute(key, value);
                    } else if (key === 'tabIndex') {
                        el.tabIndex = value;
                    } else {
                        el[key] = value;
                    }
                }
            }

            if (children !== undefined && children !== null) {
                if (typeof children === 'string') {
                    el.textContent = children;
                } else if (children instanceof HTMLElement) {
                    el.appendChild(children);
                } else if (Array.isArray(children)) {
                    for (var i = 0; i < children.length; i++) {
                        if (children[i] instanceof HTMLElement) {
                            el.appendChild(children[i]);
                        }
                    }
                }
            }

            return el;
        }

        function on(element, event, handler, options) {
            if (!element || !event || !handler) return function () { };

            element.addEventListener(event, handler, options);

            var entry = {
                element: element,
                event: event,
                handler: handler,
                options: options
            };
            listeners.push(entry);

            return function remove() {
                element.removeEventListener(event, handler, options);
                var idx = listeners.indexOf(entry);
                if (idx > -1) {
                    listeners.splice(idx, 1);
                }
            };
        }

        function removeAllListeners() {
            for (var i = listeners.length - 1; i >= 0; i--) {
                var entry = listeners[i];
                try {
                    entry.element.removeEventListener(entry.event, entry.handler, entry.options);
                } catch (e) {
                    console.warn('Failed to remove listener:', e);
                }
            }
            listeners = [];
        }

        function show(el) {
            if (typeof el === 'string') el = get(el);
            if (el) el.classList.remove('hidden');
        }

        function hide(el) {
            if (typeof el === 'string') el = get(el);
            if (el) el.classList.add('hidden');
        }

        function toggleClass(el, className, force) {
            if (typeof el === 'string') el = get(el);
            if (el) el.classList.toggle(className, force);
        }

        function hasClass(el, className) {
            if (typeof el === 'string') el = get(el);
            return el ? el.classList.contains(className) : false;
        }

        /**
         * Get element's computed dimensions safely
         * @param {string|HTMLElement} el - Element or ID
         * @returns {{width: number, height: number}} Dimensions
         */
        function getComputedDimensions(el) {
            if (typeof el === 'string') el = get(el);
            if (!el) return { width: 0, height: 0 };

            // Try getBoundingClientRect first (more reliable)
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return { width: rect.width, height: rect.height };
            }

            // Fallback to clientWidth/clientHeight
            if (el.clientWidth > 0 && el.clientHeight > 0) {
                return { width: el.clientWidth, height: el.clientHeight };
            }

            // Last resort: computed style
            var style = window.getComputedStyle(el);
            return {
                width: parseFloat(style.width) || 0,
                height: parseFloat(style.height) || 0
            };
        }

        return Object.freeze({
            init: init,
            get: get,
            create: create,
            on: on,
            removeAllListeners: removeAllListeners,
            show: show,
            hide: hide,
            toggleClass: toggleClass,
            hasClass: hasClass,
            getComputedDimensions: getComputedDimensions
        });
    })();

    // ============================================
    // MODULE: Accessibility
    // ============================================
    var A11y = (function () {
        var liveRegion = null;
        var announceTimeout = null;

        function init() {
            if (liveRegion) return;

            liveRegion = DOM.create('div', {
                role: 'status',
                'aria-live': 'polite',
                'aria-atomic': 'true',
                className: 'sr-only',
                style: {
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    padding: '0',
                    margin: '-1px',
                    overflow: 'hidden',
                    clip: 'rect(0,0,0,0)',
                    whiteSpace: 'nowrap',
                    border: '0'
                }
            });
            document.body.appendChild(liveRegion);
        }

        function announce(message, priority) {
            if (!liveRegion) return;

            if (announceTimeout !== null) {
                clearTimeout(announceTimeout);
            }

            liveRegion.textContent = '';
            liveRegion.setAttribute('aria-live', priority === 'assertive' ? 'assertive' : 'polite');

            announceTimeout = setTimeout(function () {
                liveRegion.textContent = message;
                announceTimeout = null;
            }, 50);
        }

        function updateCornerAria(cornerEl, index, x, y, canvasWidth, canvasHeight) {
            if (!cornerEl || index < 0 || index > 3) return;
            if (!canvasWidth || !canvasHeight) return;

            var xPercent = Math.round((x / canvasWidth) * 100);
            var yPercent = Math.round((y / canvasHeight) * 100);
            var label = Config.CORNER_LABELS[index];

            cornerEl.setAttribute('aria-valuenow', xPercent + ',' + yPercent);
            cornerEl.setAttribute('aria-valuetext',
                label + ' at ' + xPercent + '% horizontal, ' + yPercent + '% vertical');
        }

        function destroy() {
            if (announceTimeout !== null) {
                clearTimeout(announceTimeout);
                announceTimeout = null;
            }
            if (liveRegion && liveRegion.parentNode) {
                liveRegion.parentNode.removeChild(liveRegion);
            }
            liveRegion = null;
        }

        return Object.freeze({
            init: init,
            announce: announce,
            updateCornerAria: updateCornerAria,
            destroy: destroy
        });
    })();

    // ============================================
    // MODULE: Canvas Manager
    // ============================================
    var CanvasManager = (function () {
        var srcCanvas = null;
        var srcCtx = null;
        var useOffscreen = Config.supportsOffscreenCanvas;

        function init() {
            srcCanvas = DOM.get('srcCanvas');

            if (!srcCanvas) {
                return { success: false, error: 'Canvas elements not found' };
            }

            srcCtx = srcCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });

            if (!srcCtx) {
                return { success: false, error: 'Canvas context creation failed' };
            }

            enableSmoothing(srcCtx);

            return { success: true };
        }

        function enableSmoothing(ctx) {
            if (!ctx) return;
            ctx.imageSmoothingEnabled = true;
            if (ctx.imageSmoothingQuality !== undefined) {
                ctx.imageSmoothingQuality = 'high';
            }
        }

        function getImageData(img, width, height) {
            width = width || img.width;
            height = height || img.height;

            if (useOffscreen) {
                try {
                    var offscreen = new OffscreenCanvas(width, height);
                    var ctx = offscreen.getContext('2d');
                    if (ctx) {
                        enableSmoothing(ctx);
                        ctx.drawImage(img, 0, 0, width, height);
                        return ctx.getImageData(0, 0, width, height);
                    }
                } catch (e) {
                    console.warn('OffscreenCanvas getImageData failed, using fallback:', e);
                }
            }

            var tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            var tempCtx = tempCanvas.getContext('2d');
            enableSmoothing(tempCtx);
            tempCtx.drawImage(img, 0, 0, width, height);
            var data = tempCtx.getImageData(0, 0, width, height);

            tempCanvas.width = 0;
            tempCanvas.height = 0;

            return data;
        }

        function drawSource(img, width, height) {
            // Ensure positive dimensions
            width = Math.max(Config.MIN_CANVAS_SIZE, Math.round(width));
            height = Math.max(Config.MIN_CANVAS_SIZE, Math.round(height));

            srcCanvas.width = width;
            srcCanvas.height = height;
            enableSmoothing(srcCtx);
            srcCtx.drawImage(img, 0, 0, width, height);
        }

        function drawPreviewToCanvas(canvasEl, imageData) {
            if (!canvasEl) return;
            canvasEl.width = imageData.width;
            canvasEl.height = imageData.height;
            var ctx = canvasEl.getContext('2d', { alpha: true });
            enableSmoothing(ctx);
            ctx.putImageData(imageData, 0, 0);
        }

        function clearCanvas(canvasEl) {
            if (!canvasEl) return;
            var ctx = canvasEl.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        }

        function createFullResCanvas(imageData) {
            var width = imageData.width;
            var height = imageData.height;

            if (useOffscreen) {
                try {
                    var offscreen = new OffscreenCanvas(width, height);
                    var ctx = offscreen.getContext('2d');
                    if (ctx) {
                        ctx.putImageData(imageData, 0, 0);
                        return {
                            canvas: offscreen,
                            ctx: ctx,
                            isOffscreen: true,
                            width: width,
                            height: height
                        };
                    }
                } catch (e) {
                    console.warn('OffscreenCanvas for full res failed:', e);
                }
            }

            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);

            return {
                canvas: canvas,
                ctx: ctx,
                isOffscreen: false,
                width: width,
                height: height
            };
        }

        function toBlob(canvasObj, mimeType, quality) {
            return new Promise(function (resolve, reject) {
                try {
                    if (canvasObj.isOffscreen && typeof canvasObj.canvas.convertToBlob === 'function') {
                        var options = { type: mimeType };
                        if (quality !== undefined) {
                            options.quality = quality;
                        }
                        canvasObj.canvas.convertToBlob(options)
                            .then(resolve)
                            .catch(function (e) {
                                console.warn('convertToBlob failed, using fallback:', e);
                                fallbackToBlob(canvasObj, mimeType, quality, resolve, reject);
                            });
                        return;
                    }

                    if (!canvasObj.isOffscreen && typeof canvasObj.canvas.toBlob === 'function') {
                        canvasObj.canvas.toBlob(function (blob) {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(new Error('toBlob returned null'));
                            }
                        }, mimeType, quality);
                        return;
                    }

                    fallbackToBlob(canvasObj, mimeType, quality, resolve, reject);

                } catch (e) {
                    reject(e);
                }
            });
        }

        function fallbackToBlob(canvasObj, mimeType, quality, resolve, reject) {
            try {
                var canvas = canvasObj.canvas;

                if (canvasObj.isOffscreen) {
                    var tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvasObj.width;
                    tempCanvas.height = canvasObj.height;
                    var tempCtx = tempCanvas.getContext('2d');
                    tempCtx.drawImage(canvas, 0, 0);
                    canvas = tempCanvas;
                }

                var dataUrl = canvas.toDataURL(mimeType, quality);

                var parts = dataUrl.split(',');
                var byteString = atob(parts[1]);
                var mimeMatch = parts[0].match(/:(.*?);/);
                var mime = mimeMatch ? mimeMatch[1] : mimeType;

                var ab = new ArrayBuffer(byteString.length);
                var ia = new Uint8Array(ab);
                for (var i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }

                resolve(new Blob([ab], { type: mime }));

            } catch (e) {
                reject(e);
            }
        }

        function getSourceDimensions() {
            return {
                width: srcCanvas ? srcCanvas.width : 0,
                height: srcCanvas ? srcCanvas.height : 0
            };
        }

        function cleanup(canvasObj) {
            if (!canvasObj) return;

            try {
                if (canvasObj.ctx) {
                    canvasObj.ctx.clearRect(0, 0, canvasObj.width, canvasObj.height);
                }

                // Properly cleanup both regular and OffscreenCanvas
                if (canvasObj.canvas) {
                    if (canvasObj.isOffscreen) {
                        // OffscreenCanvas cleanup: set dimensions to 0 to release memory
                        canvasObj.canvas.width = 0;
                        canvasObj.canvas.height = 0;
                    } else {
                        // Regular canvas cleanup
                        canvasObj.canvas.width = 0;
                        canvasObj.canvas.height = 0;
                    }
                }

                canvasObj.canvas = null;
                canvasObj.ctx = null;
            } catch (e) {
                console.warn('Canvas cleanup error:', e);
            }
        }

        return Object.freeze({
            init: init,
            getImageData: getImageData,
            drawSource: drawSource,
            drawPreviewToCanvas: drawPreviewToCanvas,
            clearCanvas: clearCanvas,
            createFullResCanvas: createFullResCanvas,
            toBlob: toBlob,
            getSourceDimensions: getSourceDimensions,
            cleanup: cleanup,
            get srcCanvas() { return srcCanvas; },
            get useOffscreen() { return useOffscreen; }
        });
    })();

    // ============================================
    // MODULE: Worker Manager
    // ============================================
    var WorkerManager = (function () {
        var worker = null;
        var workerUrl = null;
        var timeoutId = null;
        var currentRequestId = null;
        var messageHandler = null;

        var WORKER_CODE = [
            'var sw,sh,sd;',
            'function hasInvalidValues(a){if(!a)return!0;for(var i=0;i<a.length;i++)if("number"!=typeof a[i]||isNaN(a[i])||!isFinite(a[i]))return!0;return!1}',
            'function bilinear(x,y,dd,di){if(x<0||x>=sw-1||y<0||y>=sh-1){dd[di]=dd[di+1]=dd[di+2]=255;dd[di+3]=0;return}',
            'var x0=x|0,y0=y|0,dx=x-x0,dy=y-y0,dx1=1-dx,dy1=1-dy,i0=(y0*sw+x0)*4,i1=i0+4,i2=((y0+1)*sw+x0)*4,i3=i2+4,',
            'w0=dx1*dy1,w1=dx*dy1,w2=dx1*dy,w3=dx*dy;',
            'for(var c=0;c<4;c++)dd[di+c]=(w0*sd[i0+c]+w1*sd[i1+c]+w2*sd[i2+c]+w3*sd[i3+c])|0}',
            'function solve(A,b){var n=b.length,aug=A.map(function(r,i){return r.concat(b[i])});',
            'for(var c=0;c<n;c++){var mx=c;for(var r=c+1;r<n;r++)if(Math.abs(aug[r][c])>Math.abs(aug[mx][c]))mx=r;',
            'var t=aug[c];aug[c]=aug[mx];aug[mx]=t;if(Math.abs(aug[c][c])<1e-10)return null;',
            'for(var r=c+1;r<n;r++){var f=aug[r][c]/aug[c][c];for(var k=c;k<=n;k++)aug[r][k]-=f*aug[c][k]}}',
            'var x=[];for(var i=n-1;i>=0;i--){x[i]=aug[i][n];for(var j=i+1;j<n;j++)x[i]-=aug[i][j]*x[j];x[i]/=aug[i][i]}return x}',
            'function computeHomography(src,dst){var A=[],b=[];',
            'for(var i=0;i<4;i++){var sx=src[i].x,sy=src[i].y,dx=dst[i].x,dy=dst[i].y;',
            'A.push([sx,sy,1,0,0,0,-dx*sx,-dx*sy]);A.push([0,0,0,sx,sy,1,-dy*sx,-dy*sy]);b.push(dx,dy)}',
            'var h=solve(A,b);return h?h.concat(1):null}',
            'self.onmessage=function(e){var d=e.data;sw=d.imageData.width;sh=d.imageData.height;sd=d.imageData.data;',
            'var dw=d.destWidth,dh=d.destHeight,dst=[{x:0,y:0},{x:dw,y:0},{x:dw,y:dh},{x:0,y:dh}];',
            'var H=computeHomography(dst,d.srcCorners);',
            'if(!H||hasInvalidValues(H)){self.postMessage({error:1,errorCode:"INVALID_HOMOGRAPHY",requestId:d.requestId});return}',
            'var dd=new Uint8ClampedArray(dw*dh*4);',
            'for(var y=0;y<dh;y++)for(var x=0;x<dw;x++){',
            'var w=H[6]*x+H[7]*y+H[8];if(w===0||isNaN(w)||!isFinite(w)){self.postMessage({error:1,errorCode:"INVALID_TRANSFORM",requestId:d.requestId});return}',
            'var sx=(H[0]*x+H[1]*y+H[2])/w,sy=(H[3]*x+H[4]*y+H[5])/w;',
            'if(isNaN(sx)||isNaN(sy)||!isFinite(sx)||!isFinite(sy)){self.postMessage({error:1,errorCode:"INVALID_COORDINATES",requestId:d.requestId});return}',
            'bilinear(sx,sy,dd,(y*dw+x)*4)}',
            'self.postMessage({data:dd,w:dw,h:dh,preview:d.preview,requestId:d.requestId},[dd.buffer])}'
        ].join('\n');

        function create() {
            if (worker) return worker;

            try {
                var blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
                workerUrl = URL.createObjectURL(blob);
                worker = new Worker(workerUrl);

                worker.onmessage = function (e) {
                    clearTimeoutSafe();
                    if (messageHandler) {
                        messageHandler(e.data);
                    }
                };

                worker.onerror = function (e) {
                    console.error('Worker error:', e);
                    clearTimeoutSafe();
                    currentRequestId = null;

                    if (messageHandler) {
                        messageHandler({ error: true, errorCode: 'WORKER_ERROR' });
                    }

                    terminate();
                };

                return worker;
            } catch (e) {
                console.error('Worker creation failed:', e);
                return null;
            }
        }

        function clearTimeoutSafe() {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        }

        function onMessage(handler) {
            messageHandler = handler;
        }

        function postMessage(data, transferables) {
            var w = create();
            if (!w) {
                if (messageHandler) {
                    messageHandler({ error: true, errorCode: 'WORKER_UNAVAILABLE' });
                }
                return false;
            }

            currentRequestId = data.requestId;

            clearTimeoutSafe();
            timeoutId = setTimeout(function () {
                if (currentRequestId === data.requestId) {
                    console.warn('Worker timeout for request:', data.requestId);
                    currentRequestId = null;
                    terminate();

                    if (messageHandler) {
                        messageHandler({ error: true, errorCode: 'TIMEOUT', requestId: data.requestId });
                    }
                }
            }, Config.WORKER_TIMEOUT_MS);

            try {
                w.postMessage(data, transferables || []);
                return true;
            } catch (e) {
                console.error('Worker postMessage error:', e);
                clearTimeoutSafe();
                currentRequestId = null;
                return false;
            }
        }

        function terminate() {
            clearTimeoutSafe();
            currentRequestId = null;

            if (worker) {
                try {
                    worker.terminate();
                } catch (e) {
                    console.warn('Worker termination error:', e);
                } finally {
                    worker = null;
                }
            }

            if (workerUrl) {
                try {
                    URL.revokeObjectURL(workerUrl);
                } catch (e) {
                    console.warn('URL revocation error:', e);
                } finally {
                    workerUrl = null;
                }
            }
        }

        function isCurrentRequest(requestId) {
            return currentRequestId === requestId;
        }

        return Object.freeze({
            create: create,
            onMessage: onMessage,
            postMessage: postMessage,
            terminate: terminate,
            isCurrentRequest: isCurrentRequest
        });
    })();

    // ============================================
    // MODULE: Geometry
    // ============================================
    var Geometry = (function () {
        var EPSILON = 1.0;

        function isValidQuad(points) {
            if (!points || !Array.isArray(points) || points.length !== 4) {
                return false;
            }

            for (var i = 0; i < 4; i++) {
                var p = points[i];
                if (!p || !Utils.isValidNumber(p.x) || !Utils.isValidNumber(p.y)) {
                    return false;
                }
            }

            for (var i = 0; i < 4; i++) {
                var p1 = points[i];
                var p2 = points[(i + 1) % 4];
                var p3 = points[(i + 2) % 4];

                if (Utils.dist(p1, p2) < EPSILON) {
                    return false;
                }

                if (Math.abs(Utils.crossProduct2D(p1, p2, p3)) < EPSILON) {
                    return false;
                }
            }

            var signs = [];
            for (var i = 0; i < 4; i++) {
                var cp = Utils.crossProduct2D(
                    points[i],
                    points[(i + 1) % 4],
                    points[(i + 2) % 4]
                );
                signs.push(Math.sign(cp));
            }

            var firstSign = signs[0];
            if (firstSign === 0) return false;

            for (var i = 1; i < 4; i++) {
                if (signs[i] !== firstSign) {
                    return false;
                }
            }

            return true;
        }

        function calculateDimensions(points, scale) {
            scale = scale || 1;

            var srcPts = [];
            for (var i = 0; i < points.length; i++) {
                srcPts.push({
                    x: points[i].x / scale,
                    y: points[i].y / scale
                });
            }

            if (!isValidQuad(srcPts)) {
                return { w: 0, h: 0, src: null, isValid: false };
            }

            var topW = Utils.dist(srcPts[0], srcPts[1]);
            var bottomW = Utils.dist(srcPts[3], srcPts[2]);
            var leftH = Utils.dist(srcPts[0], srcPts[3]);
            var rightH = Utils.dist(srcPts[1], srcPts[2]);

            var w = Math.round(Math.max(topW, bottomW));
            var h = Math.round(Math.max(leftH, rightH));

            // Validate aspect ratio to prevent extreme dimensions
            var MAX_ASPECT_RATIO = 10;
            if (w > 0 && h > 0) {
                var aspectRatio = Math.max(w, h) / Math.min(w, h);
                if (aspectRatio > MAX_ASPECT_RATIO) {
                    return {
                        w: 0,
                        h: 0,
                        src: null,
                        isValid: false,
                        reason: 'Aspect ratio too extreme (max ' + MAX_ASPECT_RATIO + ':1)'
                    };
                }
            }

            return {
                w: Math.max(1, w),
                h: Math.max(1, h),
                src: srcPts,
                isValid: true
            };
        }

        function validateOutputDimensions(w, h) {
            if (w > Config.MAX_OUTPUT_DIMENSION || h > Config.MAX_OUTPUT_DIMENSION) {
                return {
                    valid: false,
                    reason: 'Output dimensions (' + w + '×' + h + ') exceed maximum (' +
                        Config.MAX_OUTPUT_DIMENSION + 'px per side).'
                };
            }

            var totalPixels = w * h;
            if (totalPixels > Config.MAX_OUTPUT_PIXELS) {
                return {
                    valid: false,
                    reason: 'Output size (' + (totalPixels / 1000000).toFixed(1) +
                        'MP) exceeds limit (' + (Config.MAX_OUTPUT_PIXELS / 1000000) + 'MP).'
                };
            }

            return { valid: true, reason: null };
        }

        function getDefaultCorners(width, height, marginRatio) {
            marginRatio = marginRatio || Config.CORNER_MARGIN_RATIO;
            var margin = Math.min(width, height) * marginRatio;

            return [
                { x: margin, y: margin },
                { x: width - margin, y: margin },
                { x: width - margin, y: height - margin },
                { x: margin, y: height - margin }
            ];
        }

        function scalePoints(points, scaleX, scaleY, maxW, maxH) {
            var result = [];
            for (var i = 0; i < points.length; i++) {
                result.push({
                    x: Utils.clamp(points[i].x * scaleX, 0, maxW),
                    y: Utils.clamp(points[i].y * scaleY, 0, maxH)
                });
            }
            return result;
        }

        return Object.freeze({
            isValidQuad: isValidQuad,
            calculateDimensions: calculateDimensions,
            validateOutputDimensions: validateOutputDimensions,
            getDefaultCorners: getDefaultCorners,
            scalePoints: scalePoints
        });
    })();

    // ============================================
    // MODULE: UI Controller
    // ============================================
    var UI = (function () {
        function showError(msg) {
            var errorEl = DOM.get('errorMsg');
            if (errorEl) {
                errorEl.textContent = msg;
                DOM.show(errorEl);
                A11y.announce('Error: ' + msg, 'assertive');
            }
        }

        function hideError() {
            DOM.hide('errorMsg');
        }

        // Loading is shown on whichever crop card is currently processing.
        var loadingTargetEl = null;

        function setLoadingTarget(el) {
            loadingTargetEl = el;
        }

        function showLoading() {
            if (loadingTargetEl) loadingTargetEl.classList.add('show');
        }

        function hideLoading() {
            if (loadingTargetEl) loadingTargetEl.classList.remove('show');
        }

        function updateDimensions(original) {
            var origDim = DOM.get('origDim');
            if (origDim && original && original.w && original.h) {
                origDim.textContent = original.w + ' × ' + original.h;
            }
        }

        function updateFileName(name) {
            var label = DOM.get('origFileName');
            if (label) {
                label.textContent = name || '';
            }
        }

        // ---- Crop tabs + per-crop preview cards ----
        var cards = {}; // cropId -> { card, canvas, loading, dim }

        function renderCropTabs(crops, activeIdx, handlers) {
            var bar = DOM.get('cropTabs');
            if (!bar) return;
            bar.innerHTML = '';

            for (var i = 0; i < crops.length; i++) {
                (function (idx) {
                    var crop = crops[idx];
                    var tab = DOM.create('button', {
                        className: 'crop-tab' + (idx === activeIdx ? ' active' : ''),
                        type: 'button',
                        role: 'tab',
                        'aria-selected': idx === activeIdx ? 'true' : 'false'
                    });
                    tab.style.setProperty('--crop-color', crop.color);

                    var swatch = DOM.create('span', { className: 'crop-swatch' });
                    var label = DOM.create('span', {}, 'Crop ' + (idx + 1));
                    tab.appendChild(swatch);
                    tab.appendChild(label);

                    tab.addEventListener('click', function () {
                        if (handlers && handlers.onSelect) handlers.onSelect(idx);
                    });

                    if (crops.length > 1 && handlers && handlers.onDiscard) {
                        var discard = DOM.create('span', {
                            className: 'crop-discard',
                            role: 'button',
                            'aria-label': 'Discard crop ' + (idx + 1),
                            title: 'Discard crop'
                        }, '×');
                        discard.addEventListener('click', function (e) {
                            e.stopPropagation();
                            handlers.onDiscard(idx);
                        });
                        tab.appendChild(discard);
                    }

                    bar.appendChild(tab);
                })(i);
            }

            var addBtn = DOM.get('addCropBtn');
            if (addBtn) addBtn.disabled = crops.length >= Config.MAX_CROPS;
        }

        function renderPreviewCards(crops, activeIdx) {
            var container = DOM.get('previewCards');
            if (!container) return;

            container.innerHTML = '';
            cards = {};
            DOM.toggleClass(container, 'multi', crops.length > 1);

            for (var i = 0; i < crops.length; i++) {
                var crop = crops[i];
                var card = DOM.create('div', {
                    className: 'preview-card' + (i === activeIdx ? ' active' : '')
                });
                card.style.setProperty('--crop-color', crop.color);

                var head = DOM.create('div', { className: 'preview-card-head' });
                var labelWrap = DOM.create('div', { className: 'preview-card-label' });
                labelWrap.appendChild(DOM.create('span', { className: 'crop-swatch' }));
                labelWrap.appendChild(DOM.create('span', {}, 'Crop ' + (i + 1)));
                var dim = DOM.create('span', { className: 'dim-badge' }, '—');
                head.appendChild(labelWrap);
                head.appendChild(dim);

                var wrap = DOM.create('div', { className: 'preview-wrap' });
                var canvas = DOM.create('canvas', {
                    'aria-label': 'Corrected result for crop ' + (i + 1)
                });
                var loading = DOM.create('div', { className: 'loading-overlay', 'aria-hidden': 'true' });
                loading.appendChild(DOM.create('span', { className: 'icon icon-spinner spin' }));
                wrap.appendChild(canvas);
                wrap.appendChild(loading);

                card.appendChild(head);
                card.appendChild(wrap);

                (function (idx) {
                    card.addEventListener('click', function () {
                        if (cardHandlers.onSelect) cardHandlers.onSelect(idx);
                    });
                })(i);

                container.appendChild(card);
                cards[crop.id] = { card: card, canvas: canvas, loading: loading, dim: dim };
            }
        }

        var cardHandlers = {};
        function setCardHandlers(h) { cardHandlers = h || {}; }

        function getCropCanvas(cropId) {
            return cards[cropId] ? cards[cropId].canvas : null;
        }

        function getCropLoading(cropId) {
            return cards[cropId] ? cards[cropId].loading : null;
        }

        function setCropDim(cropId, dims) {
            var entry = cards[cropId];
            if (!entry) return;
            entry.dim.textContent = (dims && dims.w && dims.h) ? (dims.w + ' × ' + dims.h) : '—';
        }

        function setActiveCard(crops, activeIdx) {
            for (var i = 0; i < crops.length; i++) {
                var entry = cards[crops[i].id];
                if (entry) entry.card.classList.toggle('active', i === activeIdx);
            }
        }

        function showEditor() {
            DOM.hide('uploadZone');
            DOM.toggleClass('editor', 'active', true);
        }

        function showHero() {
            DOM.show('uploadZone');
            DOM.toggleClass('editor', 'active', false);
        }

        function setDownloadState(state) {
            var btn = DOM.get('downloadBtn');
            var icon = DOM.get('downloadIcon');
            var text = DOM.get('downloadText');

            switch (state) {
                case 'processing':
                    if (btn) btn.disabled = true;
                    if (icon) icon.classList.add('spin');
                    if (text) text.textContent = 'Processing...';
                    break;
                case 'disabled':
                    if (btn) btn.disabled = true;
                    if (icon) icon.classList.remove('spin');
                    if (text) text.textContent = 'Crop';
                    break;
                case 'ready':
                default:
                    if (btn) btn.disabled = false;
                    if (icon) icon.classList.remove('spin');
                    if (text) text.textContent = 'Crop';
                    break;
            }
        }

        function showInitError(message) {
            var errorDiv = DOM.create('div', {
                style: {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: '#fee',
                    color: '#c00',
                    padding: '20px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    zIndex: '9999',
                    maxWidth: '90%',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }
            });
            errorDiv.innerHTML = '<h3 style="margin-bottom:10px">Application Error</h3><p>' + message + '</p>';
            document.body.appendChild(errorDiv);
        }

        return Object.freeze({
            showError: showError,
            hideError: hideError,
            showLoading: showLoading,
            hideLoading: hideLoading,
            setLoadingTarget: setLoadingTarget,
            updateDimensions: updateDimensions,
            updateFileName: updateFileName,
            showEditor: showEditor,
            showHero: showHero,
            setDownloadState: setDownloadState,
            showInitError: showInitError,
            renderCropTabs: renderCropTabs,
            renderPreviewCards: renderPreviewCards,
            setCardHandlers: setCardHandlers,
            getCropCanvas: getCropCanvas,
            getCropLoading: getCropLoading,
            setCropDim: setCropDim,
            setActiveCard: setActiveCard
        });
    })();

    // ============================================
    // MODULE: Quad Renderer
    // ============================================
    var QuadRenderer = (function () {
        var quadSvg = null;
        var cornersDiv = null;
        var cornerElements = [];

        function init() {
            quadSvg = DOM.get('quadSvg');
            cornersDiv = DOM.get('corners');
        }

        function setSize(width, height) {
            if (!quadSvg) return;

            // Ensure positive dimensions
            width = Math.max(1, Math.round(width));
            height = Math.max(1, Math.round(height));

            quadSvg.setAttribute('width', String(width));
            quadSvg.setAttribute('height', String(height));
            quadSvg.style.width = width + 'px';
            quadSvg.style.height = height + 'px';
        }

        var ROTATE_HANDLE_OFFSET = 30;

        // A stalk + circle extending outward from the top-right corner.
        function rotateHandleMarkup(points, color) {
            var cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
            var cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
            var tr = points[1];
            var dx = tr.x - cx, dy = tr.y - cy;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            var hx = tr.x + (dx / len) * ROTATE_HANDLE_OFFSET;
            var hy = tr.y + (dy / len) * ROTATE_HANDLE_OFFSET;

            return '<line x1="' + tr.x + '" y1="' + tr.y + '" x2="' + hx + '" y2="' + hy +
                '" stroke="' + color + '" stroke-width="2" style="pointer-events: none;"/>' +
                '<circle class="rotate-handle" cx="' + hx + '" cy="' + hy + '" r="7" fill="#ffffff" stroke="' +
                color + '" stroke-width="2.5" style="pointer-events: all; cursor: grab;"/>';
        }

        function quadMarkup(points, color, isActive, cropIdx) {
            if (points.length !== 4) return '';

            var pointsStr = points.map(function (p) {
                return p.x + ',' + p.y;
            }).join(' ');

            var markup = '';

            if (isActive) {
                markup += '<polygon points="' + pointsStr + '" fill="' + color +
                    '" fill-opacity="0.12" stroke="' + color + '" stroke-width="2"/>';
                // Interior grab area to move the whole quad (below edges so edges win near borders)
                markup += '<polygon class="move-handle" points="' + pointsStr +
                    '" fill="' + color + '" fill-opacity="0" style="pointer-events: fill; cursor: move;"/>';
                for (var i = 0; i < 4; i++) {
                    var next = (i + 1) % 4;
                    markup += '<line x1="' + points[i].x + '" y1="' + points[i].y +
                        '" x2="' + points[next].x + '" y2="' + points[next].y +
                        '" stroke="' + color + '" stroke-width="2" stroke-dasharray="5,4"/>';
                    markup += '<line class="edge-handle" data-edge="' + i + '" x1="' + points[i].x + '" y1="' + points[i].y +
                        '" x2="' + points[next].x + '" y2="' + points[next].y +
                        '" stroke="transparent" stroke-width="30" style="pointer-events: stroke; cursor: grab;"/>';
                }
                markup += rotateHandleMarkup(points, color);
            } else {
                // Dimmed visual outline (non-interactive)…
                markup += '<polygon points="' + pointsStr +
                    '" fill="' + color + '" fill-opacity="0.04" stroke="' + color +
                    '" stroke-width="1.5" stroke-dasharray="4,5" stroke-opacity="0.7"' +
                    ' style="pointer-events: none;"/>';
                // …plus a wide transparent outline that captures clicks to select the crop.
                markup += '<polygon class="crop-poly" data-crop="' + cropIdx + '" points="' + pointsStr +
                    '" fill="none" stroke="transparent" stroke-width="24"' +
                    ' style="pointer-events: stroke; cursor: pointer;"/>';
            }

            return markup;
        }

        // Render every crop's quad; only the active one gets edge handles.
        function renderQuads(crops, activeIdx) {
            if (!quadSvg) return;

            var markup = '';
            // Draw inactive crops first so the active quad sits on top
            for (var i = 0; i < crops.length; i++) {
                if (i === activeIdx) continue;
                markup += quadMarkup(crops[i].pts, crops[i].color, false, i);
            }
            if (crops[activeIdx]) {
                markup += quadMarkup(crops[activeIdx].pts, crops[activeIdx].color, true, activeIdx);
            }

            quadSvg.innerHTML = markup;
        }

        function renderCorners(points, canvasWidth, canvasHeight, color, handlers) {
            if (!cornersDiv) return;

            cornersDiv.innerHTML = '';
            cornerElements = [];

            var shortLabels = ['TL', 'TR', 'BR', 'BL'];
            for (var i = 0; i < 4; i++) {
                var el = DOM.create('div', {
                    className: 'corner',
                    'data-idx': String(i),
                    role: 'slider',
                    'aria-label': Config.CORNER_LABELS[i] + ' corner',
                    'aria-valuemin': '0',
                    'aria-valuemax': '100',
                    tabIndex: 0
                });
                if (color) el.style.background = color;

                var label = DOM.create('span', { className: 'corner-label' }, shortLabels[i]);
                el.appendChild(label);

                el.style.left = points[i].x + 'px';
                el.style.top = points[i].y + 'px';

                A11y.updateCornerAria(el, i, points[i].x, points[i].y, canvasWidth, canvasHeight);

                if (handlers) {
                    if (handlers.onDragStart) {
                        el.addEventListener('mousedown', handlers.onDragStart);
                        el.addEventListener('touchstart', handlers.onDragStart, { passive: false });
                    }
                    if (handlers.onKeydown) {
                        el.addEventListener('keydown', handlers.onKeydown);
                    }
                }

                cornersDiv.appendChild(el);
                cornerElements.push(el);
            }
        }

        function updateCornerPosition(index, x, y, canvasWidth, canvasHeight) {
            var el = cornerElements[index];
            if (!el) return;

            el.style.left = x + 'px';
            el.style.top = y + 'px';
            A11y.updateCornerAria(el, index, x, y, canvasWidth, canvasHeight);
        }

        function setCornerActive(index, active) {
            var el = cornerElements[index];
            if (el) {
                el.classList.toggle('active', active);
            }
        }

        function getCornerElement(index) {
            return cornerElements[index] || null;
        }

        return Object.freeze({
            init: init,
            setSize: setSize,
            renderQuads: renderQuads,
            renderCorners: renderCorners,
            updateCornerPosition: updateCornerPosition,
            setCornerActive: setCornerActive,
            getCornerElement: getCornerElement
        });
    })();

    // ============================================
    // MODULE: Zoom Lens
    // ============================================
    var ZoomLens = (function () {
        var LENS_SIZE = 120;
        var ZOOM_FACTOR = 3;
        var lensEl = null;
        var lensCanvas = null;
        var lensCtx = null;

        function init() {
            lensEl = DOM.get('zoomLens');
            if (!lensEl) return;

            lensCanvas = document.createElement('canvas');
            lensCanvas.width = LENS_SIZE;
            lensCanvas.height = LENS_SIZE;
            lensCtx = lensCanvas.getContext('2d');
            lensEl.appendChild(lensCanvas);
        }

        function show(srcCanvas, cornerX, cornerY, mouseClientX, mouseClientY) {
            if (!lensEl || !lensCtx || !srcCanvas) return;

            var radius = LENS_SIZE / 2;
            var sampleSize = LENS_SIZE / ZOOM_FACTOR;

            lensCtx.clearRect(0, 0, LENS_SIZE, LENS_SIZE);
            lensCtx.save();
            lensCtx.beginPath();
            lensCtx.arc(radius, radius, radius, 0, Math.PI * 2);
            lensCtx.clip();

            var sx = cornerX - sampleSize / 2;
            var sy = cornerY - sampleSize / 2;
            lensCtx.drawImage(
                srcCanvas,
                sx, sy, sampleSize, sampleSize,
                0, 0, LENS_SIZE, LENS_SIZE
            );

            // Draw crosshair in lens center
            lensCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            lensCtx.lineWidth = 1;
            lensCtx.beginPath();
            lensCtx.moveTo(radius, 0);
            lensCtx.lineTo(radius, LENS_SIZE);
            lensCtx.moveTo(0, radius);
            lensCtx.lineTo(LENS_SIZE, radius);
            lensCtx.stroke();

            lensCtx.restore();

            // Position near cursor with smart viewport clamping
            var offsetX = 20;
            var offsetY = -LENS_SIZE - 20;
            var lensX = mouseClientX + offsetX;
            var lensY = mouseClientY + offsetY;

            var vw = window.innerWidth;
            var vh = window.innerHeight;
            if (lensX + LENS_SIZE > vw) lensX = mouseClientX - LENS_SIZE - offsetX;
            if (lensY < 0) lensY = mouseClientY + 20;
            if (lensY + LENS_SIZE > vh) lensY = vh - LENS_SIZE - 10;
            if (lensX < 0) lensX = 10;

            lensEl.style.left = lensX + 'px';
            lensEl.style.top = lensY + 'px';
            lensEl.style.display = 'block';
        }

        function hide() {
            if (lensEl) {
                lensEl.style.display = 'none';
            }
        }

        return Object.freeze({
            init: init,
            show: show,
            hide: hide
        });
    })();

    // ============================================
    // MODULE: Image Processor
    // ============================================
    var ImageProcessor = (function () {
        var processing = false;
        var pending = null;
        var requestCounter = 0;
        var downloadRequestId = null;
        var fullResCanvas = null;
        var requestHandlers = {};

        var ERROR_MESSAGES = {
            'INVALID_HOMOGRAPHY': 'Invalid corner positions. Please adjust corners.',
            'INVALID_TRANSFORM': 'Transform failed. Corners may be invalid.',
            'INVALID_COORDINATES': 'Invalid coordinates detected. Adjust corners.',
            'TIMEOUT': 'Processing timed out. Try a smaller selection.',
            'WORKER_ERROR': 'Processing failed. Please try again.',
            'WORKER_UNAVAILABLE': 'Failed to initialize processor.'
        };

        function init() {
            WorkerManager.onMessage(handleWorkerMessage);
        }

        function nextRequestId() {
            return ++requestCounter;
        }

        function getErrorMessage(code) {
            return ERROR_MESSAGES[code] || 'Processing failed. Adjust the corners.';
        }

        function process(params) {
            var srcCorners = params.srcCorners;
            var destWidth = params.destWidth;
            var destHeight = params.destHeight;
            var isPreview = params.isPreview;
            var imageData = params.imageData;
            var onComplete = params.onComplete;
            var onError = params.onError;
            var requestId = nextRequestId();

            if (!imageData || destWidth < 1 || destHeight < 1 || !srcCorners) {
                if (onError) onError('Invalid parameters');
                return null;
            }

            if (isPreview && processing) {
                pending = {
                    srcCorners: srcCorners,
                    destWidth: destWidth,
                    destHeight: destHeight,
                    imageData: imageData,
                    isPreview: true,
                    onComplete: onComplete,
                    onError: onError,
                    requestId: requestId
                };
                return requestId;
            }

            if (!isPreview) {
                var validation = Geometry.validateOutputDimensions(destWidth, destHeight);
                if (!validation.valid) {
                    if (onError) onError(validation.reason + ' Select a smaller region.');
                    return null;
                }
            }

            processing = true;
            if (isPreview) UI.showLoading();

            try {
                // Validate ImageData integrity before cloning
                if (!imageData.data || imageData.data.length !== imageData.width * imageData.height * 4) {
                    throw new Error('Invalid or corrupted image data');
                }

                var clonedData = new ImageData(
                    new Uint8ClampedArray(imageData.data),
                    imageData.width,
                    imageData.height
                );

                requestHandlers[requestId] = {
                    isPreview: isPreview,
                    onComplete: onComplete,
                    onError: onError
                };

                if (!isPreview) {
                    downloadRequestId = requestId;
                }

                WorkerManager.postMessage({
                    imageData: clonedData,
                    srcCorners: srcCorners,
                    destWidth: destWidth,
                    destHeight: destHeight,
                    preview: isPreview,
                    requestId: requestId
                }, [clonedData.data.buffer]);

                return requestId;

            } catch (err) {
                console.error('Process error:', err);
                processing = false;
                UI.hideLoading();
                if (onError) onError('Failed to process image.');
                return null;
            }
        }

        function handleWorkerMessage(data) {
            if (!data) {
                processing = false;
                pending = null;
                UI.hideLoading();
                return;
            }

            var handlers = requestHandlers[data.requestId];
            delete requestHandlers[data.requestId];

            if (data.error) {
                var msg = getErrorMessage(data.errorCode);
                processing = false;
                pending = null;
                UI.hideLoading();

                if (data.requestId === downloadRequestId) {
                    downloadRequestId = null;
                }

                if (handlers && handlers.onError) {
                    handlers.onError(msg);
                }
                return;
            }

            try {
                var imgData = new ImageData(
                    new Uint8ClampedArray(data.data),
                    data.w,
                    data.h
                );

                if (data.preview) {
                    UI.hideLoading();
                    processing = false;

                    if (handlers && handlers.onComplete) {
                        handlers.onComplete(imgData);
                    }

                    if (pending) {
                        var p = pending;
                        pending = null;
                        process(p);
                    }
                } else {
                    if (data.requestId === downloadRequestId) {
                        fullResCanvas = CanvasManager.createFullResCanvas(imgData);
                        processing = false;

                        if (handlers && handlers.onComplete) {
                            handlers.onComplete(fullResCanvas);
                        }
                    } else {
                        processing = false;
                    }
                }
            } catch (err) {
                console.error('Result processing error:', err);
                processing = false;
                pending = null;
                UI.hideLoading();

                if (handlers && handlers.onError) {
                    handlers.onError('Failed to render result.');
                }
            }
        }

        function getFullResCanvas() {
            return fullResCanvas;
        }

        function clearFullResCanvas() {
            if (fullResCanvas) {
                CanvasManager.cleanup(fullResCanvas);
                fullResCanvas = null;
            }
        }

        function isProcessing() {
            return processing;
        }

        function reset() {
            processing = false;
            pending = null;
            requestHandlers = {};
            downloadRequestId = null;
            clearFullResCanvas();
        }

        return Object.freeze({
            init: init,
            process: process,
            getFullResCanvas: getFullResCanvas,
            clearFullResCanvas: clearFullResCanvas,
            isProcessing: isProcessing,
            reset: reset
        });
    })();

    // ============================================
    // MODULE: File Handler
    // ============================================
    var FileHandler = (function () {
        var currentFileName = '';
        var onLoadCallback = null;

        function onLoad(callback) {
            onLoadCallback = callback;
        }

        function getFileName() {
            return currentFileName;
        }

        function loadFile(file) {
            if (!file) {
                UI.showError('No file provided');
                return;
            }

            currentFileName = file.name || 'image';

            var reader = new FileReader();

            reader.onerror = function () {
                UI.showError('Failed to read file');
            };

            reader.onload = function (e) {
                loadFromDataUrl(e.target.result);
            };

            reader.readAsDataURL(file);
        }

        function loadFromDataUrl(dataUrl) {
            var img = new Image();

            img.onerror = function () {
                UI.showError('Failed to load image. File may be corrupted or unsupported.');
            };

            img.onload = function () {
                if (img.width < 1 || img.height < 1) {
                    UI.showError('Invalid image: zero or negative dimensions.');
                    return;
                }

                var totalPixels = img.width * img.height;
                if (totalPixels > Config.MAX_INPUT_PIXELS) {
                    UI.showError(
                        'Image too large (' + (totalPixels / 1000000).toFixed(1) +
                        'MP). Maximum is ' + (Config.MAX_INPUT_PIXELS / 1000000) + 'MP.'
                    );
                    return;
                }

                try {
                    var imageData = CanvasManager.getImageData(img);

                    A11y.announce('Image loaded: ' + currentFileName + ', ' +
                        img.width + ' by ' + img.height + ' pixels');

                    if (onLoadCallback) {
                        onLoadCallback({
                            image: img,
                            imageData: imageData,
                            fileName: currentFileName
                        });
                    }
                } catch (err) {
                    console.error('Image processing error:', err);
                    UI.showError('Failed to process image. It may be too large for this browser.');
                }
            };

            img.src = dataUrl;
        }

        function isValidImageFile(file) {
            return file && file.type && file.type.indexOf('image') === 0;
        }

        return Object.freeze({
            onLoad: onLoad,
            loadFile: loadFile,
            isValidImageFile: isValidImageFile,
            getFileName: getFileName
        });
    })();

    // ============================================
    // MODULE: Download Manager
    // ============================================
    var DownloadManager = (function () {
        var inProgress = false;
        var lastDownloadTime = 0;

        function isInProgress() {
            return inProgress;
        }

        function startDownload(canvasObj, options) {
            options = options || {};
            if (inProgress && !options.skipThrottle) {
                return Promise.reject(new Error('Download in progress'));
            }

            if (!options.skipThrottle) {
                var now = Date.now();
                if (now - lastDownloadTime < Config.DOWNLOAD_THROTTLE_MS) {
                    return Promise.reject(new Error('Please wait before downloading again'));
                }
                lastDownloadTime = now;
            }

            inProgress = true;
            UI.setDownloadState('processing');

            var origName = FileHandler.getFileName() || 'image';
            var lastDotIdx = origName.lastIndexOf('.');
            var baseName = lastDotIdx !== -1 ? origName.substring(0, lastDotIdx) : origName;
            var suffix = options.suffix || '';
            var filename = baseName + '-CORRECTED' + suffix + '.png';

            return CanvasManager.toBlob(canvasObj, 'image/png')
                .then(function (blob) {
                    return triggerDownload(blob, filename);
                })
                .then(function () {
                    A11y.announce('Download started: ' + filename);
                    finishDownload();
                })
                .catch(function (err) {
                    console.error('Download error:', err);
                    finishDownload();
                    throw err;
                });
        }

        function triggerDownload(blob, filename) {
            return new Promise(function (resolve, reject) {
                try {
                    var url = URL.createObjectURL(blob);
                    var link = document.createElement('a');
                    link.download = filename;
                    link.href = url;

                    // Safari fix: hide link instead of making it invisible
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();

                    // CRITICAL FIX for Safari/macOS:
                    // Safari needs time to process the download before we remove the link
                    // Removing too quickly cancels the download (user reported bug)
                    // Combining cleanup operations for better performance
                    setTimeout(function () {
                        try {
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                        } catch (e) {
                            console.warn('Download cleanup failed:', e);
                        }
                    }, 100); // 100ms is enough for all browsers including Safari

                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        }

        function finishDownload() {
            inProgress = false;
            UI.setDownloadState('ready');
        }

        function reset() {
            inProgress = false;
            UI.setDownloadState('ready');
        }

        return Object.freeze({
            isInProgress: isInProgress,
            startDownload: startDownload,
            reset: reset
        });
    })();

    // ============================================
    // MODULE: Editor Controller
    // ============================================
    var Editor = (function () {
        var origImg = null;
        var origData = null;
        var scale = 1;

        // Multi-crop state: each crop owns its own 4 corner points + color.
        var crops = [];        // [{ id, color, pts: [{x,y} x4] }]
        var activeIdx = 0;
        var cropSeq = 0;

        var dragging = false;
        var dragIdx = -1;
        var rafPending = false;
        var previewTimer = null;

        // Edge drag state
        var edgeDragging = false;
        var edgeDragIdx = -1;
        var edgeMouseStart = { x: 0, y: 0 };
        var edgePtsStart = [];

        // Whole-quad move state
        var movingQuad = false;
        var moveMouseStart = { x: 0, y: 0 };
        var movePtsStart = [];

        // Arbitrary-rotation state
        var rotating = false;
        var rotateCenter = { x: 0, y: 0 };
        var rotateStartAngle = 0;
        var rotatePtsStart = [];

        function isFullscreen() {
            var el = DOM.get('editPanel');
            var native = document.fullscreenElement || document.webkitFullscreenElement;
            return !!native || (el && el.classList.contains('is-fullscreen'));
        }

        function activeCrop() {
            return crops[activeIdx] || null;
        }

        function activePts() {
            return crops[activeIdx] ? crops[activeIdx].pts : [];
        }

        function pickColor() {
            var used = {};
            for (var i = 0; i < crops.length; i++) used[crops[i].color] = true;
            for (var c = 0; c < Config.CROP_COLORS.length; c++) {
                if (!used[Config.CROP_COLORS[c]]) return Config.CROP_COLORS[c];
            }
            return Config.CROP_COLORS[crops.length % Config.CROP_COLORS.length];
        }

        function makeCrop(pts, color) {
            return { id: ++cropSeq, color: color || pickColor(), pts: pts };
        }

        function init() {
            QuadRenderer.init();
            ImageProcessor.init();
            ZoomLens.init();

            UI.setCardHandlers({ onSelect: setActiveCrop });

            var quadSvg = DOM.get('quadSvg');
            if (quadSvg) {
                quadSvg.addEventListener('mousedown', startEdgeDrag);
                quadSvg.addEventListener('touchstart', startEdgeDrag, { passive: false });
            }
        }

        function renderTabs() {
            UI.renderCropTabs(crops, activeIdx, {
                onSelect: setActiveCrop,
                onDiscard: removeCrop
            });
        }

        function rebuildCards() {
            UI.renderPreviewCards(crops, activeIdx);
        }

        /**
         * Calculate display scale based on container and image size
         * @param {HTMLImageElement} img - Source image
         * @returns {{scale: number, width: number, height: number}} Calculated dimensions
         */
        function calculateDisplaySize(img) {
            var container = DOM.get('origContainer');
            var containerWidth = Config.MIN_CANVAS_SIZE;
            var containerHeight = Config.MIN_CANVAS_SIZE;

            if (container) {
                // Get actual container dimensions
                var dims = DOM.getComputedDimensions(container);
                containerWidth = dims.width;
                containerHeight = dims.height;

                // If container has no computed size, use fallback
                if (containerWidth <= 0) {
                    containerWidth = container.clientWidth || window.innerWidth - 64;
                }
                if (containerHeight <= 0) {
                    containerHeight = container.clientHeight || window.innerHeight * 0.5;
                }
            } else {
                containerWidth = window.innerWidth - 64;
                containerHeight = window.innerHeight * 0.5;
            }

            // In fullscreen the edit area owns the whole screen, so let the image
            // use most of the viewport height instead of the usual 50% cap.
            var heightRatio = isFullscreen() ? 0.92 : Config.MAX_HEIGHT_VIEWPORT_RATIO;

            // Apply padding
            var maxW = Math.max(Config.MIN_CANVAS_SIZE, containerWidth - 32);
            var maxH = Math.max(Config.MIN_CANVAS_SIZE, Math.min(containerHeight, window.innerHeight * heightRatio));

            // Calculate scale
            var imgScale = Math.min(maxW / img.width, maxH / img.height, 1);

            // Calculate display dimensions
            var displayW = Math.max(Config.MIN_CANVAS_SIZE, Math.round(img.width * imgScale));
            var displayH = Math.max(Config.MIN_CANVAS_SIZE, Math.round(img.height * imgScale));

            return {
                scale: imgScale,
                width: displayW,
                height: displayH
            };
        }

        function setup(imageData) {
            origImg = imageData.image;
            origData = imageData.imageData;

            // Calculate display size
            var displaySize = calculateDisplaySize(origImg);
            scale = displaySize.scale;

            // Draw source image
            CanvasManager.drawSource(origImg, displaySize.width, displaySize.height);
            QuadRenderer.setSize(displaySize.width, displaySize.height);

            // Update dimension display
            UI.updateDimensions({ w: origImg.width, h: origImg.height });
            UI.updateFileName(FileHandler.getFileName());

            // Start with a single crop
            var dims = CanvasManager.getSourceDimensions();
            crops = [makeCrop(Geometry.getDefaultCorners(dims.width, dims.height), Config.CROP_COLORS[0])];
            activeIdx = 0;

            UI.hideError();
            rebuildCards();
            renderTabs();
            renderAll();
            refreshAllPreviews();

            // Show editor
            UI.showEditor();
        }

        // Reset the active crop's corners to the default rectangle.
        function renderAll() {
            var dims = CanvasManager.getSourceDimensions();

            if (dims.width < 1 || dims.height < 1) {
                console.warn('Invalid canvas dimensions for rendering');
                return;
            }

            var crop = activeCrop();
            QuadRenderer.renderCorners(activePts(), dims.width, dims.height, crop ? crop.color : null, {
                onDragStart: startDrag,
                onKeydown: handleCornerKeydown
            });
            QuadRenderer.renderQuads(crops, activeIdx);
        }

        function addCrop() {
            if (!origImg || crops.length >= Config.MAX_CROPS) return;

            var dims = CanvasManager.getSourceDimensions();
            // Inset the new crop more than the default so it's visibly distinct.
            var newCrop = makeCrop(Geometry.getDefaultCorners(dims.width, dims.height, 0.22));
            crops.push(newCrop);
            activeIdx = crops.length - 1;

            UI.hideError();
            rebuildCards();        // rebuilds all card canvases…
            renderTabs();
            renderAll();
            refreshAllPreviews();  // …so re-render every crop's preview
            A11y.announce('Crop ' + crops.length + ' added');
        }

        function removeCrop(idx) {
            if (crops.length <= 1 || idx < 0 || idx >= crops.length) return;

            crops.splice(idx, 1);
            if (activeIdx >= crops.length) activeIdx = crops.length - 1;
            else if (idx < activeIdx) activeIdx--;

            UI.hideError();
            rebuildCards();
            renderTabs();
            renderAll();
            refreshAllPreviews();
            A11y.announce('Crop removed');
        }

        function setActiveCrop(idx) {
            if (idx === activeIdx || idx < 0 || idx >= crops.length) return;
            activeIdx = idx;

            // Switching crops doesn't change geometry — no reprocessing needed.
            renderAll();
            renderTabs();
            UI.setActiveCard(crops, activeIdx);
            updatePreview(); // refresh active crop's dim/state + download button
        }

        function startDrag(e) {
            e.preventDefault();
            dragging = true;
            dragIdx = parseInt(e.target.getAttribute('data-idx'), 10);
            QuadRenderer.setCornerActive(dragIdx, true);

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchmove', onDrag, { passive: false });
            document.addEventListener('touchend', stopDrag);
        }

        function onDrag(e) {
            if (!dragging || dragIdx < 0) return;
            e.preventDefault();

            var canvas = CanvasManager.srcCanvas;
            var rect = canvas.getBoundingClientRect();
            var clientX, clientY;

            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            var x = Utils.clamp(clientX - rect.left, 0, canvas.width);
            var y = Utils.clamp(clientY - rect.top, 0, canvas.height);

            activePts()[dragIdx] = { x: x, y: y };

            QuadRenderer.updateCornerPosition(dragIdx, x, y, canvas.width, canvas.height);
            QuadRenderer.renderQuads(crops, activeIdx);

            // Show zoom lens magnifier near cursor
            ZoomLens.show(canvas, x, y, clientX, clientY);

            UI.hideError();

            // Live preview: use requestAnimationFrame without throttle delay
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(function () {
                    rafPending = false;
                    updatePreview();
                });
            }
        }

        function stopDrag() {
            if (dragIdx >= 0) {
                QuadRenderer.setCornerActive(dragIdx, false);
            }

            dragging = false;
            dragIdx = -1;

            // Hide zoom lens
            ZoomLens.hide();

            // CRITICAL: Must match options used in addEventListener
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchmove', onDrag, { passive: false });
            document.removeEventListener('touchend', stopDrag);

            updatePreview();
        }

        // Pointer position relative to the source canvas.
        function pointerPos(e) {
            var rect = CanvasManager.srcCanvas.getBoundingClientRect();
            var clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return { x: clientX - rect.left, y: clientY - rect.top };
        }

        function startEdgeDrag(e) {
            var target = e.target;
            var cls = target.getAttribute('class') || '';

            // Clicking an inactive crop's outline selects it instead of dragging.
            if (cls.indexOf('crop-poly') !== -1) {
                e.preventDefault();
                var cropIdx = parseInt(target.getAttribute('data-crop'), 10);
                if (!isNaN(cropIdx)) setActiveCrop(cropIdx);
                return;
            }

            // Rotation handle near the top-right corner.
            if (cls.indexOf('rotate-handle') !== -1) {
                startRotate(e);
                return;
            }

            // Interior grab → move the whole quad.
            if (cls.indexOf('move-handle') !== -1) {
                startQuadMove(e);
                return;
            }

            if (cls.indexOf('edge-handle') === -1) return;

            e.preventDefault();
            edgeDragging = true;
            edgeDragIdx = parseInt(target.getAttribute('data-edge'), 10);

            edgePtsStart = Utils.deepClone(activePts());

            var canvas = CanvasManager.srcCanvas;
            var rect = canvas.getBoundingClientRect();
            var clientX, clientY;

            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            edgeMouseStart = {
                x: clientX - rect.left,
                y: clientY - rect.top
            };

            document.addEventListener('mousemove', onEdgeDrag);
            document.addEventListener('mouseup', stopEdgeDrag);
            document.addEventListener('touchmove', onEdgeDrag, { passive: false });
            document.addEventListener('touchend', stopEdgeDrag);
        }

        // How far a point at `start` can slide along unit vector `dir` (per axis)
        // before its x or y leaves [0, width]/[0, height]. Used to keep an edge
        // drag from pushing corners off the canvas while sliding along an angle.
        function clampSlide(t, points, dir, width, height) {
            var min = -Infinity, max = Infinity;

            function bound(start, d, limit) {
                if (d === 0) return;
                var t1 = (0 - start) / d;
                var t2 = (limit - start) / d;
                min = Math.max(min, Math.min(t1, t2));
                max = Math.min(max, Math.max(t1, t2));
            }

            for (var i = 0; i < points.length; i++) {
                bound(points[i].x, dir.x, width);
                bound(points[i].y, dir.y, height);
            }

            return Utils.clamp(t, min, max);
        }

        function onEdgeDrag(e) {
            if (!edgeDragging || edgeDragIdx < 0) return;
            e.preventDefault();

            var canvas = CanvasManager.srcCanvas;
            var rect = canvas.getBoundingClientRect();
            var clientX, clientY;

            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            var currX = clientX - rect.left;
            var currY = clientY - rect.top;
            var dx = currX - edgeMouseStart.x;
            var dy = currY - edgeMouseStart.y;

            var p1Idx = edgeDragIdx;
            var p2Idx = (edgeDragIdx + 1) % 4;
            var q1Idx = (edgeDragIdx + 3) % 4;
            var q2Idx = (edgeDragIdx + 2) % 4;

            var p1 = edgePtsStart[p1Idx];
            var p2 = edgePtsStart[p2Idx];
            var q1 = edgePtsStart[q1Idx];
            var q2 = edgePtsStart[q2Idx];

            // Outward normal of the dragged edge — perpendicular to the edge's
            // *current* (possibly rotated) direction, pointing away from the
            // opposite edge. Sliding both edge corners along it grows/shrinks
            // the quad while keeping it a parallelogram, whatever its rotation.
            var edgeX = p2.x - p1.x;
            var edgeY = p2.y - p1.y;
            var edgeLen = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
            if (edgeLen < 1e-6) return;

            var nx = -edgeY / edgeLen;
            var ny = edgeX / edgeLen;

            var midP = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            var midQ = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 };
            if ((midP.x - midQ.x) * nx + (midP.y - midQ.y) * ny < 0) {
                nx = -nx;
                ny = -ny;
            }

            // How far the mouse moved along that normal is how far the edge slides.
            var t = dx * nx + dy * ny;
            t = clampSlide(t, [p1, p2], { x: nx, y: ny }, canvas.width, canvas.height);

            var pts = activePts();
            pts[p1Idx].x = p1.x + t * nx;
            pts[p1Idx].y = p1.y + t * ny;
            pts[p2Idx].x = p2.x + t * nx;
            pts[p2Idx].y = p2.y + t * ny;

            QuadRenderer.updateCornerPosition(p1Idx, pts[p1Idx].x, pts[p1Idx].y, canvas.width, canvas.height);
            QuadRenderer.updateCornerPosition(p2Idx, pts[p2Idx].x, pts[p2Idx].y, canvas.width, canvas.height);
            QuadRenderer.renderQuads(crops, activeIdx);

            UI.hideError();

            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(function () {
                    rafPending = false;
                    updatePreview();
                });
            }
        }

        function stopEdgeDrag() {
            edgeDragging = false;
            edgeDragIdx = -1;

            document.removeEventListener('mousemove', onEdgeDrag);
            document.removeEventListener('mouseup', stopEdgeDrag);
            document.removeEventListener('touchmove', onEdgeDrag, { passive: false });
            document.removeEventListener('touchend', stopEdgeDrag);

            updatePreview();
        }

        // ---- Move the whole quad ----
        function startQuadMove(e) {
            if (!activeCrop()) return;
            e.preventDefault();
            movingQuad = true;
            movePtsStart = Utils.deepClone(activePts());
            moveMouseStart = pointerPos(e);

            document.addEventListener('mousemove', onQuadMove);
            document.addEventListener('mouseup', stopQuadMove);
            document.addEventListener('touchmove', onQuadMove, { passive: false });
            document.addEventListener('touchend', stopQuadMove);
        }

        function onQuadMove(e) {
            if (!movingQuad) return;
            e.preventDefault();

            var canvas = CanvasManager.srcCanvas;
            var pos = pointerPos(e);
            var dx = pos.x - moveMouseStart.x;
            var dy = pos.y - moveMouseStart.y;

            // Clamp the translation so every corner stays within the canvas.
            var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (var i = 0; i < movePtsStart.length; i++) {
                minX = Math.min(minX, movePtsStart[i].x);
                maxX = Math.max(maxX, movePtsStart[i].x);
                minY = Math.min(minY, movePtsStart[i].y);
                maxY = Math.max(maxY, movePtsStart[i].y);
            }
            dx = Utils.clamp(dx, -minX, canvas.width - maxX);
            dy = Utils.clamp(dy, -minY, canvas.height - maxY);

            var pts = activePts();
            for (var j = 0; j < pts.length; j++) {
                pts[j].x = movePtsStart[j].x + dx;
                pts[j].y = movePtsStart[j].y + dy;
                QuadRenderer.updateCornerPosition(j, pts[j].x, pts[j].y, canvas.width, canvas.height);
            }
            QuadRenderer.renderQuads(crops, activeIdx);

            UI.hideError();
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(function () {
                    rafPending = false;
                    updatePreview();
                });
            }
        }

        function stopQuadMove() {
            movingQuad = false;
            document.removeEventListener('mousemove', onQuadMove);
            document.removeEventListener('mouseup', stopQuadMove);
            document.removeEventListener('touchmove', onQuadMove, { passive: false });
            document.removeEventListener('touchend', stopQuadMove);
            updatePreview();
        }

        // ---- Rotate the quad to an arbitrary angle ----
        function startRotate(e) {
            if (!activeCrop()) return;
            e.preventDefault();
            rotating = true;
            rotatePtsStart = Utils.deepClone(activePts());

            var cx = 0, cy = 0;
            for (var i = 0; i < rotatePtsStart.length; i++) {
                cx += rotatePtsStart[i].x;
                cy += rotatePtsStart[i].y;
            }
            rotateCenter = { x: cx / 4, y: cy / 4 };

            var pos = pointerPos(e);
            rotateStartAngle = Math.atan2(pos.y - rotateCenter.y, pos.x - rotateCenter.x);

            document.addEventListener('mousemove', onRotate);
            document.addEventListener('mouseup', stopRotate);
            document.addEventListener('touchmove', onRotate, { passive: false });
            document.addEventListener('touchend', stopRotate);
        }

        function onRotate(e) {
            if (!rotating) return;
            e.preventDefault();

            var canvas = CanvasManager.srcCanvas;
            var pos = pointerPos(e);
            var angle = Math.atan2(pos.y - rotateCenter.y, pos.x - rotateCenter.x) - rotateStartAngle;
            var cos = Math.cos(angle), sin = Math.sin(angle);

            // Free rotation around the centroid (corners may leave the image).
            var pts = activePts();
            for (var i = 0; i < pts.length; i++) {
                var ox = rotatePtsStart[i].x - rotateCenter.x;
                var oy = rotatePtsStart[i].y - rotateCenter.y;
                pts[i].x = rotateCenter.x + ox * cos - oy * sin;
                pts[i].y = rotateCenter.y + ox * sin + oy * cos;
                QuadRenderer.updateCornerPosition(i, pts[i].x, pts[i].y, canvas.width, canvas.height);
            }
            QuadRenderer.renderQuads(crops, activeIdx);

            UI.hideError();
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(function () {
                    rafPending = false;
                    updatePreview();
                });
            }
        }

        function stopRotate() {
            rotating = false;
            document.removeEventListener('mousemove', onRotate);
            document.removeEventListener('mouseup', stopRotate);
            document.removeEventListener('touchmove', onRotate, { passive: false });
            document.removeEventListener('touchend', stopRotate);
            updatePreview();
        }

        function handleCornerKeydown(e) {
            var key = e.key;

            if (key !== 'ArrowUp' && key !== 'ArrowDown' &&
                key !== 'ArrowLeft' && key !== 'ArrowRight') {
                return;
            }

            e.preventDefault();

            var idx = parseInt(e.target.getAttribute('data-idx'), 10);
            if (isNaN(idx) || idx < 0 || idx > 3) return;

            var step = e.shiftKey ? Config.CORNER_STEP_FAST : Config.CORNER_STEP;
            var canvas = CanvasManager.srcCanvas;
            var pts = activePts();
            var pt = pts[idx];
            var newX = pt.x;
            var newY = pt.y;

            switch (key) {
                case 'ArrowUp': newY -= step; break;
                case 'ArrowDown': newY += step; break;
                case 'ArrowLeft': newX -= step; break;
                case 'ArrowRight': newX += step; break;
            }

            newX = Utils.clamp(newX, 0, canvas.width);
            newY = Utils.clamp(newY, 0, canvas.height);

            pts[idx] = { x: newX, y: newY };

            QuadRenderer.updateCornerPosition(idx, newX, newY, canvas.width, canvas.height);
            QuadRenderer.renderQuads(crops, activeIdx);

            UI.hideError();
            updatePreview();
        }

        // Refresh the active crop's preview (debounced unless mid-drag).
        function updatePreview() {
            if (previewTimer !== null) {
                clearTimeout(previewTimer);
                previewTimer = null;
            }

            var idx = activeIdx;
            // During active drag, update immediately for true live preview
            if (dragging) {
                doPreviewUpdate(idx);
            } else {
                previewTimer = setTimeout(function () {
                    previewTimer = null;
                    doPreviewUpdate(idx);
                }, Config.PREVIEW_DEBOUNCE_MS);
            }
        }

        // Reprocess every crop's preview (used after add/remove/rotate/resize).
        function refreshAllPreviews() {
            for (var i = 0; i < crops.length; i++) {
                doPreviewUpdate(i);
            }
        }

        function doPreviewUpdate(cropIdx) {
            var crop = crops[cropIdx];
            if (!crop) return;

            var isActiveCrop = cropIdx === activeIdx;
            var dims = Geometry.calculateDimensions(crop.pts, scale);

            if (!dims.isValid || !dims.src) {
                CanvasManager.clearCanvas(UI.getCropCanvas(crop.id));
                UI.setCropDim(crop.id, null);
                if (isActiveCrop) {
                    UI.showError('Invalid selection: corners form an invalid shape.');
                    UI.setDownloadState('disabled');
                }
                return;
            }

            if (isActiveCrop) {
                UI.hideError();
                if (!DownloadManager.isInProgress()) {
                    UI.setDownloadState('ready');
                }
            }

            var previewScale = Math.min(
                Config.MAX_PREVIEW_SIZE / dims.w,
                Config.MAX_PREVIEW_SIZE / dims.h,
                1
            );
            var previewW = Math.max(1, Math.round(dims.w * previewScale));
            var previewH = Math.max(1, Math.round(dims.h * previewScale));

            var loadEl = UI.getCropLoading(crop.id);
            if (loadEl) loadEl.classList.add('show');

            ImageProcessor.process({
                srcCorners: dims.src,
                destWidth: previewW,
                destHeight: previewH,
                isPreview: true,
                imageData: origData,
                onComplete: function (imgData) {
                    if (loadEl) loadEl.classList.remove('show');
                    CanvasManager.drawPreviewToCanvas(UI.getCropCanvas(crop.id), imgData);
                    UI.setCropDim(crop.id, { w: dims.w, h: dims.h });
                },
                onError: function (msg) {
                    if (loadEl) loadEl.classList.remove('show');
                    if (isActiveCrop) UI.showError(msg);
                }
            });
        }

        function processFullRes(dims) {
            return new Promise(function (resolve, reject) {
                ImageProcessor.process({
                    srcCorners: dims.src,
                    destWidth: dims.w,
                    destHeight: dims.h,
                    isPreview: false,
                    imageData: origData,
                    onComplete: function (canvasObj) { resolve(canvasObj); },
                    onError: function (msg) { reject(new Error(msg)); }
                });
            });
        }

        // Download every valid crop as its own file (sequentially).
        function download() {
            if (!origImg || DownloadManager.isInProgress()) return;

            UI.hideError();

            var valid = [];
            for (var i = 0; i < crops.length; i++) {
                var dims = Geometry.calculateDimensions(crops[i].pts, scale);
                if (dims.isValid && dims.src && Geometry.validateOutputDimensions(dims.w, dims.h).valid) {
                    valid.push({ index: i, dims: dims });
                }
            }

            if (!valid.length) {
                UI.showError('Cannot download: no valid crop selection.');
                return;
            }

            var multi = valid.length > 1;

            UI.setDownloadState('processing');
            A11y.announce('Processing ' + valid.length + ' crop' + (multi ? 's' : '') + ' for download');

            var chain = Promise.resolve();
            valid.forEach(function (item, k) {
                chain = chain.then(function () {
                    return processFullRes(item.dims).then(function (canvasObj) {
                        var suffix = multi ? '-crop-' + (item.index + 1) : '';
                        return DownloadManager.startDownload(canvasObj, {
                            suffix: suffix,
                            skipThrottle: k > 0
                        }).then(function () {
                            ImageProcessor.clearFullResCanvas();
                        });
                    });
                });
            });

            chain.then(function () {
                UI.setDownloadState('ready');
            }).catch(function (err) {
                UI.showError('Download failed: ' + (err.message || err));
                ImageProcessor.clearFullResCanvas();
                DownloadManager.reset();
            });
        }

        function handleResize() {
            if (!origImg) return;

            var oldDims = CanvasManager.getSourceDimensions();
            if (oldDims.width < 1 || oldDims.height < 1) return;

            // Recalculate display size
            var newSize = calculateDisplaySize(origImg);

            var scaleX = newSize.width / oldDims.width;
            var scaleY = newSize.height / oldDims.height;

            for (var i = 0; i < crops.length; i++) {
                crops[i].pts = Geometry.scalePoints(crops[i].pts, scaleX, scaleY, newSize.width, newSize.height);
            }
            scale = newSize.scale;

            CanvasManager.drawSource(origImg, newSize.width, newSize.height);
            QuadRenderer.setSize(newSize.width, newSize.height);
            renderAll();
            refreshAllPreviews();
        }

        function isActive() {
            return DOM.hasClass('editor', 'active');
        }

        function cancelDrag() {
            if (dragging) {
                stopDrag();
            }
        }

        function reset() {
            origImg = null;
            origData = null;
            scale = 1;
            crops = [];
            activeIdx = 0;
            dragging = false;
            dragIdx = -1;
            rafPending = false;

            if (previewTimer !== null) {
                clearTimeout(previewTimer);
                previewTimer = null;
            }

            ZoomLens.hide();
            ImageProcessor.reset();
            DownloadManager.reset();
        }

        return Object.freeze({
            init: init,
            setup: setup,
            download: download,
            handleResize: handleResize,
            isActive: isActive,
            cancelDrag: cancelDrag,
            reset: reset,
            addCrop: addCrop,
            removeCrop: removeCrop,
            setActiveCrop: setActiveCrop
        });
    })();

    // ============================================
    // MODULE: Event Bindings
    // ============================================
    var EventBindings = (function () {
        function init() {
            bindFileUpload();
            bindButtons();
            bindKeyboard();
            bindResize();
            bindFullscreen();
            bindGlobalErrors();
            bindContextMenu();
            bindUnload();
        }

        function bindFullscreen() {
            var btn = DOM.get('fullscreenBtn');
            var panel = DOM.get('editPanel');
            if (!btn || !panel) return;

            function nativeEl() {
                return document.fullscreenElement || document.webkitFullscreenElement || null;
            }
            function supportsNative() {
                return !!(panel.requestFullscreen || panel.webkitRequestFullscreen);
            }
            function isOpen() {
                return nativeEl() === panel || panel.classList.contains('is-fullscreen');
            }

            function cssEnter() {
                panel.classList.add('is-fullscreen');
                afterChange();
            }
            function enter() {
                if (supportsNative()) {
                    try {
                        var req = panel.requestFullscreen
                            ? panel.requestFullscreen()
                            : panel.webkitRequestFullscreen();
                        if (req && typeof req.catch === 'function') {
                            req.catch(function () { cssEnter(); }); // fall back if blocked
                        }
                    } catch (e) {
                        cssEnter();
                    }
                } else {
                    cssEnter();
                }
            }
            function exit() {
                if (nativeEl() === panel) {
                    var fn = document.exitFullscreen || document.webkitExitFullscreen;
                    if (fn) fn.call(document);
                } else if (panel.classList.contains('is-fullscreen')) {
                    panel.classList.remove('is-fullscreen');
                    afterChange();
                }
            }
            function toggle() {
                if (isOpen()) exit(); else enter();
            }

            function afterChange() {
                var open = isOpen();
                btn.classList.toggle('active', open);
                btn.setAttribute('aria-label', open ? 'Exit full screen edit view' : 'Toggle full screen edit view');
                btn.title = open ? 'Exit full screen (F)' : 'Full screen (F)';
                A11y.announce(open ? 'Entered full screen' : 'Exited full screen');
                // Let the new layout settle, then resize the canvas to fit it.
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        if (Editor.isActive()) Editor.handleResize();
                    });
                });
            }

            DOM.on(btn, 'click', toggle);
            DOM.on(document, 'fullscreenchange', afterChange);
            DOM.on(document, 'webkitfullscreenchange', afterChange);

            DOM.on(document, 'keydown', function (e) {
                if (!e.key || !Editor.isActive()) return;
                var ae = document.activeElement;
                var tn = ae ? ae.tagName : '';
                var isInput = tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT';

                if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !isInput) {
                    e.preventDefault();
                    toggle();
                } else if (e.key === 'Escape' && panel.classList.contains('is-fullscreen')) {
                    exit(); // native handles its own Esc; this covers the CSS fallback
                }
            });
        }

        function bindFileUpload() {
            var uploadZone = DOM.get('uploadZone');
            var fileInput = DOM.get('fileInput');
            var errorMsg = DOM.get('errorMsg');

            if (uploadZone && fileInput) {
                DOM.on(uploadZone, 'click', function (e) {
                    if (e.target !== errorMsg) {
                        fileInput.click();
                    }
                });

                DOM.on(uploadZone, 'keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInput.click();
                    }
                });

                DOM.on(uploadZone, 'dragover', function (e) {
                    e.preventDefault();
                    uploadZone.classList.add('drag-over');
                });

                DOM.on(uploadZone, 'dragleave', function (e) {
                    e.preventDefault();
                    uploadZone.classList.remove('drag-over');
                });

                DOM.on(uploadZone, 'drop', function (e) {
                    e.preventDefault();
                    uploadZone.classList.remove('drag-over');
                    UI.hideError();

                    var files = e.dataTransfer && e.dataTransfer.files;
                    if (files && files[0]) {
                        if (FileHandler.isValidImageFile(files[0])) {
                            FileHandler.loadFile(files[0]);
                        } else {
                            UI.showError('Please upload an image file (JPG, PNG, WebP)');
                        }
                    }
                });

                DOM.on(fileInput, 'change', function () {
                    UI.hideError();
                    if (fileInput.files && fileInput.files[0]) {
                        FileHandler.loadFile(fileInput.files[0]);
                    }
                });
            }

            DOM.on(document, 'paste', function (e) {
                var items = e.clipboardData && e.clipboardData.items;
                if (!items) return;

                for (var i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') === 0) {
                        e.preventDefault();
                        UI.hideError();
                        var file = items[i].getAsFile();
                        if (file) {
                            // Validate file size before loading (max 50MB)
                            var MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
                            if (file.size > MAX_FILE_SIZE) {
                                UI.showError('Pasted image too large (' +
                                    (file.size / 1024 / 1024).toFixed(1) +
                                    'MB). Maximum is 50MB.');
                                return;
                            }
                            FileHandler.loadFile(file);
                        }
                        break;
                    }
                }
            });
        }

        function bindButtons() {
            var newBtn = DOM.get('newBtn');
            var addCropBtn = DOM.get('addCropBtn');
            var downloadBtn = DOM.get('downloadBtn');
            var fileInput = DOM.get('fileInput');

            if (newBtn && fileInput) {
                DOM.on(newBtn, 'click', function () {
                    fileInput.value = '';
                    fileInput.click();
                });
            }

            if (addCropBtn) {
                DOM.on(addCropBtn, 'click', function () {
                    Editor.addCrop();
                });
            }

            if (downloadBtn) {
                DOM.on(downloadBtn, 'click', function () {
                    Editor.download();
                });
            }
        }

        function bindKeyboard() {
            DOM.on(document, 'keydown', function (e) {
                var key = e.key;
                if (!key) return;

                var activeEl = document.activeElement;
                var tagName = activeEl ? activeEl.tagName : '';
                var isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';

                if (!Editor.isActive()) return;

                if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 's') {
                    e.preventDefault();
                    Editor.download();
                    return;
                }

                if (key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey && !isInput) {
                    e.preventDefault();
                    Editor.addCrop();
                    return;
                }

                if (key === 'Escape') {
                    Editor.cancelDrag();
                }
            });
        }

        function bindResize() {
            var debouncedResize = Utils.debounce(function () {
                if (Editor.isActive()) {
                    Editor.handleResize();
                }
            }, Config.RESIZE_DEBOUNCE_MS);

            DOM.on(window, 'resize', debouncedResize);
        }

        function bindGlobalErrors() {
            DOM.on(window, 'error', function (e) {
                console.error('Global error:', e.message, e.filename, e.lineno);
                UI.showError('An error occurred. Please refresh the page.');
                UI.hideLoading();
                DownloadManager.reset();
            });

            DOM.on(window, 'unhandledrejection', function (e) {
                console.error('Unhandled rejection:', e.reason);
                UI.showError('An error occurred. Please refresh the page.');
                UI.hideLoading();
                DownloadManager.reset();
            });
        }

        function bindContextMenu() {
            var corners = DOM.get('corners');
            if (corners) {
                DOM.on(corners, 'contextmenu', function (e) {
                    e.preventDefault();
                });
            }
        }

        function bindUnload() {
            DOM.on(window, 'beforeunload', function () {
                WorkerManager.terminate();
                A11y.destroy();
                DOM.removeAllListeners();
            });
        }

        return Object.freeze({
            init: init
        });
    })();

    // ============================================
    // MODULE: Application Controller
    // ============================================
    var App = (function () {
        var initialized = false;

        function init() {
            if (initialized) {
                console.warn('App already initialized');
                return;
            }

            var domResult = DOM.init();
            if (!domResult.success) {
                UI.showInitError(
                    'Failed to initialize. Missing elements: ' +
                    domResult.missing.join(', ') + '. Please refresh the page.'
                );
                return;
            }

            var canvasResult = CanvasManager.init();
            if (!canvasResult.success) {
                UI.showInitError(canvasResult.error + '. Please use a modern browser.');
                return;
            }

            A11y.init();
            Editor.init();

            FileHandler.onLoad(function (imageData) {
                // Reset previous state
                Editor.reset();
                ImageProcessor.reset();
                DownloadManager.reset();

                // Setup editor with new image
                Editor.setup(imageData);
            });

            // Bind all event handlers
            EventBindings.init();

            // Mark as initialized
            initialized = true;

            // Log initialization info
            if (typeof console !== 'undefined' && console.log) {
                console.log('%cPerspectiveFix Pro v2.0.1', 'color: #059669; font-weight: bold; font-size: 14px;');
                console.log('OffscreenCanvas:', Config.supportsOffscreenCanvas ? '✓' : '✗');
                console.log('ImageBitmap:', Config.supportsImageBitmap ? '✓' : '✗');
            }

            // Add ready class after brief delay for smooth transitions
            setTimeout(function () {
                document.body.classList.add('ready');
            }, 100);
        }

        function isInitialized() {
            return initialized;
        }

        function getConfig() {
            return Utils.deepClone(Config);
        }

        function getAPI() {
            return {
                Config: Config,
                Utils: Utils,
                DOM: DOM,
                A11y: A11y,
                CanvasManager: CanvasManager,
                WorkerManager: WorkerManager,
                Geometry: Geometry,
                UI: UI,
                QuadRenderer: QuadRenderer,
                ImageProcessor: ImageProcessor,
                FileHandler: FileHandler,
                DownloadManager: DownloadManager,
                Editor: Editor
            };
        }

        function getVersion() {
            return {
                version: '2.0.1',
                name: 'PerspectiveFix Pro',
                author: 'OathanRex'
            };
        }

        return Object.freeze({
            init: init,
            isInitialized: isInitialized,
            getConfig: getConfig,
            getAPI: getAPI,
            getVersion: getVersion
        });
    })();

    // ============================================
    // INITIALIZATION
    // ============================================

    function safeInit() {
        try {
            App.init();
        } catch (e) {
            console.error('Application initialization failed:', e);
            UI.showInitError('Failed to start application. Error: ' + e.message);
        }
    }

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', safeInit);
    } else {
        // DOM already loaded, initialize immediately
        safeInit();
    }

    // Fallback: Also check on window load
    window.addEventListener('load', function () {
        if (!App.isInitialized()) {
            safeInit();
        }
    });

    // Expose app globally for debugging
    if (typeof window !== 'undefined') {
        window.PerspectiveFixApp = App;
    }

})();
