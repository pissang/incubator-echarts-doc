// Global doc schema manager.
// Not in the vue observer.
import {fetch} from 'whatwg-fetch';
// import stripHtml from 'string-strip-html';
// import Fuse from 'fuse.js';


let baseUrl;
let rootName;

// Cached data.
let outlineFetcher;
let outline;

let descStorage = {};
let pageOutlines;

let outlineNodesMap = {};


function stripHtml(str) {
    // Simple and fast regexp html replacer
    // string-strip-html is toooo slow.
    return str.replace(/<[^>]*>?/gm, '');
}
/**
 * Convert path to element id.
 */
export function convertPathToId(path) {
    return 'doc-content-' + path
        .replace(/[\. <>]/g, '-');
}
/**
 * Get doc json async
 */
export function getOutlineAsync() {
    if (!outlineFetcher) {
        throw new Error('Preload json with url first');
    }
    return outlineFetcher;
}

function processOutlines(json) {
    outline = json;

    pageOutlines = {};

    function joinPath(a, b, connector) {
        return a ? (a + connector + b) : b;
    }
    function processNode(node, parentNode) {
        if (!node.type) {
            node.type = typeof node.default;
        }
        if (!(node.type instanceof Array)) {
            node.type = [node.type];
        }
        // Normalize to any
        for (let i = 0; i < node.type.length; i++) {
            if (node.type[i] === '*') {
                node.type[i] = 'any';
            }
        }

        if (node.arrayItemType) {
            node.path = joinPath(parentNode.path, node.arrayItemType, '-');
        }
        else {
            node.path = joinPath(parentNode.path, node.prop, '.');
        }
        if (node.children) {
            // Ignore option.series, option.dataZoom, option.visualMap
            if (node.path.indexOf('.') < 0 && !node.children[0].arrayItemType) {
                pageOutlines[node.path] = node;
            }

            for (let i = 0; i < node.children.length; i++) {
                processNode(node.children[i], node);
            }
        }
        outlineNodesMap[node.path] = node;
    }

    for (let i = 0; i < json.children.length; i++) {
        processNode(json.children[i], {});
    }

    json.isRoot = true;

    return json;
}
/**
 * Preload doc json
 */
export function preload(_baseUrl, _rootName) {
    baseUrl = _baseUrl;
    rootName = _rootName;

    let outlineUrl = `${baseUrl}/${rootName}-outline.json`;

    if (!outlineFetcher) {
        outlineFetcher = fetch(outlineUrl)
            .then(response => response.json())
            .then(_json => processOutlines(_json));
    }


    return outlineFetcher;
}

/**
 * Get outline of page
 */
export function getPageOutlineAsync(targetPath) {
    let pagePath = targetPath.split('.')[0];
    return getOutlineAsync().then(() => {
        return pageOutlines[pagePath]
            // Use top outline for `option.color`, etc.
            || getOutlineAsync();
    });
}

export function getRootPageTotalDescAsync() {
    let partionKey = rootName;
    if (!descStorage[partionKey]) {
        let url = `${baseUrl}/${partionKey}.json`;
        descStorage[partionKey] = {
            fetcher: fetch(url).then(response => response.json())
        };
    }
    return descStorage[partionKey].fetcher;
}

function createIndexer(map, pagePath) {
    let list = [];
    for (let path in map) {
        list.push({
            path: pagePath ? (pagePath + '.' + path) : path,
            content: map[path],
            text: stripHtml(map[path])
        });
    }

    return {
        search(query) {
            let results = [];
            // TODO 常用词汇联想
            let tokens = query.split(/[ +,]/).filter(t => !!t).map(token => {
                // Case insensitive
                return new RegExp(token, 'i');
            });
            if (!tokens.length) {
                return results;
            }
            for (let k = 0; k < list.length; k++) {
                let searched = true;
                for (let i = 0; i < tokens.length; i++) {
                    if (!tokens[i].test(list[k].text) && !tokens[i].test(list[k].path)) {
                        searched = false;
                        break;
                    }
                }
                if (searched) {
                    results.push(list[k]);
                }
            }
            return results;
        }
    };
}

function ensurePageDescStorage(targetPath) {
    if (!pageOutlines) {
        throw new Error('Outline data is not loaded.');
    }
    let pagePath = targetPath.split('.')[0];

    // Configuration like `option.color`, `option.backgroundColor` is in the `option` page.
    // Configuration like `option.series-bar` is in the `option.series-bar` page.
    let partionKey = !pageOutlines[pagePath] || !targetPath
        ? rootName
        : rootName + '.' + pagePath;

    if (!descStorage[partionKey]) {
        let url = `${baseUrl}/${partionKey}.json`;
        let fetcher = fetch(url).then(response => response.json());
        descStorage[partionKey] = {
            fetcher
        };

        fetcher.then(map => {
            descStorage[partionKey].indexer = createIndexer(map, pagePath);
        });
    }

    return descStorage[partionKey];
}
/**
 * Get all description of page.
 */
export function getPageTotalDescAsync(targetPath) {
    return ensurePageDescStorage(targetPath).fetcher;
}

// TODO Cancel
/**
 * Do loading page desc files and searching progressively
 */
export function searchAllAsync(queryString, onAdd) {
    return getOutlineAsync().then(() => {
        return new Promise(resolve => {
            let asyncCount = 0;

            function decreaseAsyncCount() {
                asyncCount--;
                if (!asyncCount) {
                    resolve();
                }
            }
            function searchInPage(pagePath) {
                let obj = ensurePageDescStorage(pagePath);

                if (obj.indexer) {
                    onAdd(obj.indexer.search(queryString));
                }
                else {
                    asyncCount++;
                    obj.fetcher.then(() => {
                        onAdd(obj.indexer.search(queryString));
                        decreaseAsyncCount();
                    }).catch(e => {
                        decreaseAsyncCount();
                    });
                }
            }
            // Search in root page.
            searchInPage('');
            for (let pagePath in pageOutlines) {
                searchInPage(pagePath);
            }

            if (!asyncCount) {
                resolve();
            }
        });
    });
}
/**
 * Search outline with given query. Return list of nodes
 */
export function searchOutlineAsync(queryString, numberLimit = Infinity) {
    return getOutlineAsync().then(outline => {
        let lists = [];
        function search(node) {
            if (lists.length >= numberLimit) {
                return;
            }
            if (node.path && node.path.indexOf(queryString) >= 0) {
                lists.push(node);
            }
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) {
                    search(node.children[i]);
                }
            }
        }
        search(outline);

        return lists;
    });
}

export function getOutlineNode(path) {
    return outlineNodesMap[path];
}

export function getDefaultPage(wrongPath) {
    if (!wrongPath) {
        return Object.keys(pageOutlines)[0];
    }
    let firstKey;
    for (let key in pageOutlines) {
        if (!firstKey) {
            firstKey = key;
        }
        // Find the page
        if (wrongPath.indexOf(key) >= 0) {
            return key;
        }
    }
    return firstKey;
}