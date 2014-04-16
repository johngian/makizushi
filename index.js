var fs = require('fs'),
    path = require('path'),
    blend = require('blend'),
    xtend = require('xtend'),
    maki = require('maki');

var markerCache = require('./cache');

var offsets = {
        's': {x:4,y:4},
        'm': {x:6,y:5},
        'l': {x:5,y:7},
        's@2x': {x:8,y:8},
        'm@2x': {x:12,y:10},
        'l@2x': {x:10,y:14}
    },
    sizes = { s: 12, m: 18, l: 24 },
    makiRenders = maki.dirname + '/renders/';

module.exports = getMarker;

/**
 * Given a marker object like
 *
 * { base, tint, symbol, name }
 *
 * Call callback with buffer.
 *
 * @param {object} options
 * @param {function} callback
 */
function getMarker(options, callback) {
    if (options.tint) {
        // Expand hex shorthand (3 chars) to 6, e.g. 333 => 333333.
        // This is not done upstream in `node-tint` as some such
        // shorthand cannot be disambiguated from other tintspec strings,
        // e.g. 123 (rgb shorthand) vs. 123 (hue).
        if (options.tint.length === 3) {
            options.tint =
                options.tint[0] + options.tint[0] +
                options.tint[1] + options.tint[1] +
                options.tint[2] + options.tint[2];
        }
        options.parsedTint = blend.parseTintString(options.tint);
    }

    if (!options.symbol || (options.symbol && options.symbol.length === 1)) {
        loadCached(options, callback);
    } else {
        loadMaki(options, callback);
    }
}

/**
 * Load & composite a marker from the maki icon set.
 *
 * @param {object} options
 * @param {function} callback
 */
function loadMaki(options, callback) {
    var base = options.base + '-' + options.size,
        size = options.size,
        symbol = options.symbol + '-' + sizes[size] + (options.retina ? '@2x' : '');

    if (!base || !size) {
        return callback('Marker "' + JSON.stringify(options) + '" is invalid because it lacks base or size.');
    }

    fs.readFile(makiRenders + symbol + '.png', function(err, data) {
        if (err) return callback('Marker "' + JSON.stringify(options) + '" is invalid because the symbol is not found.');

        // Base marker gets tint applied.
        var parts = [{
            buffer: markerCache.base[base],
            tint: options.parsedTint
        }];

        // If symbol is present, find correct offset (varies by marker size).
        if (symbol) {
            parts.push(xtend({
                buffer: data,
                tint: blend.parseTintString('0x0;0x0;1.4x0'),
            }, offsets[size + (options.retina ? '@2x' : '')]));
        }

        // Add mask layer.
        parts.push({
            buffer: markerCache.mask[base]
        });

        // Extract width and height from the IHDR. The IHDR chunk must appear
        // first, so the location is always fixed.
        var width = markerCache.base[base].readUInt32BE(16),
            height = markerCache.base[base].readUInt32BE(20);

        // Combine base, (optional) symbol, to supply the final marker.
        blend(parts, {
            format: 'png',
            quality: 256,
            width: width,
            height: height
        }, function(err, data) {
            if (err) return callback(err);
            return callback(null, data);
        });
    });
}

/**
 * Load & generate a cached [a-z0-9] marker.
 *
 * @param {object} options
 * @param {function} callback
 */
function loadCached(options, callback) {
    var base = options.base + '-' + options.size,
        size = options.size,
        symbol = options.symbol + '-' + options.size + (options.retina ? '@2x' : '');

    if (!base || !size || !markerCache.base[base] ||
        (symbol && !markerCache.symbol[symbol])) {
        return callback('Marker "' + JSON.stringify(options) + '" is invalid.');
    }

    // Base marker gets tint applied.
    var parts = [{
        buffer: markerCache.base[base],
        tint: options.parsedTint
    }];

    // If symbol is present, find correct offset (varies by marker size).
    if (symbol) {
        parts.push(xtend({
            buffer: markerCache.symbol[symbol],
            tint: blend.parseTintString('0x0;0x0;1.4x0'),
        }, offsets[size + (options.retina ? '@2x' : '')]));
    }

    // Add mask layer.
    parts.push({ buffer:markerCache.mask[base] });

    // Extract width and height from the IHDR. The IHDR chunk must appear
    // first, so the location is always fixed.
    var width = markerCache.base[base].readUInt32BE(16),
        height = markerCache.base[base].readUInt32BE(20);

    // Combine base, (optional) symbol, to supply the final marker.
    blend(parts, {
        format: 'png',
        quality: 256,
        width: width,
        height: height
    }, function(err, data) {
        if (err) return callback(err);
        return callback(null,  data);
    });
}
