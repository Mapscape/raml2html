var raml2obj = require('raml2obj');
var pjson = require('./package.json');
var Q = require('q');
var path = require('path');
var ramlJsonSchemaExpander = require('raml-jsonschema-expander');

/**
 * Render the source RAML object using the config's processOutput function
 *
 * The config object should contain at least the following property:
 * processRamlObj: function that takes the raw RAML object and returns a promise with the rendered HTML
 *
 * @param {(String|Object)} source - The source RAML file. Can be a filename, url, contents of the RAML file,
 * or an already-parsed RAML object.
 * @param {Object} config
 * @param {Function} config.processRamlObj
 * @returns a promise
 */
function render(source, config) {
  config = config || {};
  config.raml2HtmlVersion = pjson.version;

  return raml2obj.parse(source).then(function(ramlObj) {
    ramlObj.config = config;

    if (config.processRamlObj) {
      ramlObj = ramlJsonSchemaExpander.expandJsonSchemas(ramlObj);
      return config.processRamlObj(ramlObj, source).then(function(html) {
        if (config.postProcessHtml) {
          return config.postProcessHtml(html);
        }

        return html;
      });
    }

    return ramlObj;
  });
}

/**
 * @param {String} [mainTemplate] - The filename of the main template, leave empty to use default templates
 * @param {String} [templatesPath] - Optional, by default it uses the current working directory
 * @returns {{processRamlObj: Function, postProcessHtml: Function}}
 */
function getDefaultConfig(mainTemplate, templatesPath) {
  if (!mainTemplate) {
    mainTemplate = './lib/template.nunjucks';

    // When using the default template, make sure that Nunjucks isn't
    // using the working directory since that might be anything
    templatesPath = __dirname;
  }

  return {
    processRamlObj: function(ramlObj, source) {
      var nunjucks = require('nunjucks');
      var markdown = require('nunjucks-markdown');
      var marked = require('marked');
      var fs = require('fs');

      var renderer = new marked.Renderer();
      renderer.table = function(thead, tbody) {
        // Render Bootstrap style tables
        return '<table class="table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
      };

      // Setup the Nunjucks environment with the markdown parser
      var env = nunjucks.configure(templatesPath, {watch: false});
      markdown.register(env, function(md) {
        return marked(md, {renderer: renderer});
      });

      // Nunjucks filter to support loading code fragments from
      // external files
      env.addFilter('includeCode', function(sourcePath, value) {
        try {
            var result = value || '';
            return result.replace(/#includeCode:(.+)/g, function(match, file) {
                return '```\n' + fs.readFileSync(path.join(sourcePath, file)) + '\n```';
            });
        } catch (e) {
            console.error('Error processing markdown for %s: %s', value, e);
            return value;
        }
      }.bind(null, path.dirname(source)));

      // Add extra function for finding a security scheme by name
      ramlObj.securitySchemeWithName = function(name) {
        for (var i=0; i < ramlObj.securitySchemes.length; i++) {
          if (ramlObj.securitySchemes[i][name]) {
            return ramlObj.securitySchemes[i][name];
          }
        }
      };

      // Render the main template using the raml object and fix the double quotes
      var html = env.render(mainTemplate, ramlObj);
      html = html.replace(/&quot;/g, '"');

      // Return the promise with the html
      return Q.fcall(function() {
        return html;
      });
    },

    postProcessHtml: function(html) {
      // Minimize the generated html and return the promise with the result
      var Minimize = require('minimize');
      var minimize = new Minimize({quotes: true});

      var deferred = Q.defer();

      minimize.parse(html, function(error, result) {
        if (error) {
          deferred.reject(new Error(error));
        } else {
          deferred.resolve(result);
        }
      });

      return deferred.promise;
    }
  };
}

module.exports = {
  getDefaultConfig: getDefaultConfig,
  render: render
};

if (require.main === module) {
  console.log('This script is meant to be used as a library. You probably want to run bin/raml2html if you\'re looking for a CLI.');
  process.exit(1);
}
