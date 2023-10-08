module.exports = function(grunt) {
  require('time-grunt')(grunt);
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-babel');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      files: ['*.js', '!node_modules/**/*'],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    babel: {
      options: {
        presets: ['@babel/preset-env']
      },
      dist: {
        files: {
          'build/app.js': ['popup.js']
        }
      }
    },

    browserify: {
      dist: {
        files: {
          'build/module.js': 'build/app.js'
        }
      }
    },

    concat: {
      js: {
        options: {
          separator: ';'
        },
        src: ['vendor/spin.js', 'vendor/ladda.js', 'vendor/selectize.js', 'vendor/moment.js', 'build/module.js'],
        dest: 'build/main.js'
      }
    },

    uglify: {
      options: {
        mangle: false,
        sourceMap: true,
        sourceMapIncludeSources: false,
        preserveComments: false
      },
      js: {
        files: {
          'public/js/scripts.min.js': ['build/main.js']
        }
      }
    },

    less: {
      default: {
        files: {
          'build/main.css': ['vendor/selectize.less', 'vendor/selectize.default.less', 'popup.less']
        },
        options: {
          plugins: [
            new (require('less-plugin-autoprefix'))({
              browsers: ['last 2 versions']
            }),
            new (require('less-plugin-clean-css'))({
              sourceMap: true,
              advanced: true
            })
          ]
        }
      }
    },

    cssmin: {
      combine: {
        files: {
          'build/merged.css': ['vendor/ladda.min.css', 'build/main.css']
        }
      },
      minify: {
        src: 'build/merged.css',
        dest: 'public/css/style.min.css'
      }
    },

    watch: {
      js: {
        files: ['*.js', '.jshintrc'],
        tasks: ['browserify', 'concat:js', 'uglify:js'],
        options: {
          livereload: true
        }
      },
      less: {
        files: ['*.less', 'vendor/*.less'],
        tasks: ['less'],
        options: {
          livereload: true
        }
      },
      css: {
        files: 'build/main.css',
        tasks: ['cssmin:combine', 'cssmin:minify'],
        options: {
          livereload: true
        }
      }
    },

    connect: {
      server: {}
    }
  });

  grunt.registerTask('default', [
                     'less', 'cssmin:combine', 'cssmin:minify',
                     //'jshint',
                     'babel', 'browserify', 'concat:js', 'uglify:js',
                     'watch'
                    ]);
};
