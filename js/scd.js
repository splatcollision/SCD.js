var Scd = function(videoEl, options, callback) {
    // Public properties.
    // Contains detected scene changes timecodes.
    this.sceneTimecodes = [];

    // Public methods.
    this.start;

    this.pause = function() {
        if(_stop) {
            return;
        }

        if(_mode == "FastForwardMode") {
            videoEl.removeEventListener("seeked", FastForwardModeEvent, false);
            // Restore video element controls to its original state.
            videoEl.controls = _controls;
        }
        videoEl.pause();
    };

    this.stop = function() {
        that.pause();

        if(_mode == "FastForwardMode") {
            // Restore video element controls to its original state.
            videoEl.controls = _controls;
        }

        _stop = 1;
    };

    // Private properties.
    var that = this;
    var document = window.document;
    var Math = window.Math;

    // Default mode is FastForward. Playback mode is used on browser that don't support setting current playback time to sub seconds (e.g. Opera).
    var _mode = "FastForwardMode";

    // The width and height at which the frames will be resized down to for comparison.
    var _step = 50;

    // The minimal duration of a scene in s. 2 consecutive scene changes can be detected within this interval.
    var _minSceneDuration = 0.25;

    // Percentage color difference above which a scene change is detected (0 <= threshold <= 100).
    var _threshold = 25;

    // Display detected scenes first frame.
    var _debug = 0;
  
    /**
     * Maximum color difference possible.
     * @const
     * @type {number}
     */
    var maxDiff = Math.sqrt(Math.pow(255, 2) * 3);
    var maxDiff100;

    var _currentTime = 0;
    var _lastCurrentTime = 0;    // Used in PlaybackMode only.

    var _width = 0;
    var _height = 0;

    var _controls = videoEl.controls;

    var _canvasA = document.createElement("canvas");
    var _canvasB = document.createElement("canvas");
    var _ctxA = _canvasA.getContext("2d");
    var _ctxB = _canvasB.getContext("2d");

    var _stop;
    var _step_sq;
    var _debugContainer;
    var getVideoData = function() {
        // durationchange appears to be the first event triggered by video that exposes width and height.
        _width = this.videoWidth;
        _height = this.videoHeight;
        _canvasA.width = _step;
        _canvasA.height = _step;
        _canvasB.width = _step;
        _canvasB.height = _step;
        //_ctxA.drawImage(this, 0, 0, _width, _height, 0, 0, _step, _step);

        videoEl.removeEventListener("durationchange", getVideoData, false);
    };

    /**
     * @constructor
     */
    var init = function() {
        // Options.
        if(typeof options !== undefined) {
            if(options.mode && options.mode == "PlaybackMode") {
                _mode = options.mode;
            }
            if(options.step) {
                _step = parseInt(options.step, 10);
            }
            if(options.minSceneDuration) {
                _minSceneDuration = parseFloat(options.minSceneDuration);
            }
            if(options.threshold) {
                _threshold = parseFloat(options.threshold);
            }
            if(options.debug) {
                _debug = Boolean(options.debug);
            }
            _lastCurrentTime = _minSceneDuration;
        }
        // _threshold is set between 0 and maxDiff interval to save calculations later.
        _threshold = _threshold * maxDiff / 100;
        // The number of pixels of resized frames. Used to speed up average calculation.
        _step_sq = Math.pow(_step, 2);

        // Debug
        if(_debug) {
            maxDiff100 = maxDiff / 100;
            _debugContainer = document.createElement("div");
            _debugContainer.className = "scd-debug";
            document.getElementsByTagName("body")[0].appendChild(_debugContainer);
        }

        // @todo: Call this function is Scd is instantiated after durationchange was triggered.
        videoEl.addEventListener("durationchange", getVideoData, false);

        that.start = (_mode == "FastForwardMode") ? function() {
            // Fast forward mode.
            if(_stop) {
                return;
            }

            // Remove controls from video during process.
            videoEl.controls = 0;

            videoEl.currentTime = _currentTime;
            videoEl.addEventListener("seeked", fastForwardModeEvent, false);

            detectSceneChange();
        } : function() {
            // Playback mode.
            if(_stop) {
                return;
            }

            // Remove controls from video during process.
            videoEl.controls = 0;

            videoEl.currentTime = 0;
            videoEl.addEventListener("timeupdate", playbackModeEvent, false);

            videoEl.play();
        };

        /**
         * Calculates the median value of an array.
         * @param {Array.<number>} numArray An array of values.
         * @return {number} The median value.
         * @private
         */
        getMedian = (_step_sq % 2) ? function(numArray) {
            numArray.sort(compare);
            return numArray[((_step_sq + 1) / 2) - 1];
        } : function(numArray) {
            numArray.sort(compare);
            var middle = (_step_sq + 1) / 2;
            return (numArray[middle - 1.5] + numArray[middle - 0.5]) / 2;
        };
    }

    // Triggered by seeked event on FastForwardMode.
    var fastForwardModeEvent = function() {
        detectSceneChange();

        _currentTime += _minSceneDuration;
        videoEl.currentTime = _currentTime;
    };

    // Triggered by timeupdate event on PlaybackMode.
    var playbackModeEvent = function() {
        if(video.currentTime - _lastCurrentTime >= _minSceneDuration) {
            detectSceneChange();

            _lastCurrentTime = video.currentTime;
        }
    };

    var detectSceneChange = function() {
        if(_stop) {
            return;
        }

        // @fixme: Bug on Opera. duration is not always defined.
        if(videoEl.ended || _currentTime > videoEl.duration) {
            if(callback) {
                callback();
            }
            that.stop();

            return;
        }

        _ctxA.drawImage(videoEl, 0, 0, _width, _height, 0, 0, _step, _step);
        var diff = computeDifferences(_ctxA, _ctxB);

        if(diff[0] > _threshold) {
            that.sceneTimecodes.push(_currentTime);
            if(_debug) {
                var tmpContainer = document.createElement("div");
                var tmpCanvasA = document.createElement("canvas");
                var half_width = tmpCanvasA.width = _width / 2;
                var half_height = tmpCanvasA.height = _height / 2;
                tmpCanvasA.getContext("2d").drawImage(videoEl, 0, 0, _width, _height, 0, 0, half_width, half_height);
                tmpContainer.appendChild(tmpCanvasA);
                tmpContainer.appendChild(document.createElement("br"));
                tmpContainer.appendChild(document.createTextNode("max: " + Math.round(diff[2] / maxDiff100) + "%, avg: " + Math.round(diff[0] / maxDiff100) + "%, med: " + Math.round(diff[1] / maxDiff100) + "%, min: " + Math.round(diff[3] / maxDiff100) + "%"));
                _debugContainer.appendChild(tmpContainer);
            }
        }

        _ctxB.drawImage(_canvasA, 0, 0, _step, _step, 0, 0, _step, _step);
    };

    var computeDifferences = function(ctxA, ctxB) {
        var colorsA = ctxA.getImageData(0, 0, _step, _step).data;
        var colorsB = ctxB.getImageData(0, 0, _step, _step).data;
        var diff = [];
        var i = colorsA.length;
        var max;
        var avg;
        var med;
        var min;

        do {
            diff.push(getColorDistance(colorsA[i-4], colorsA[i+1-4], colorsA[i+2-4], colorsB[i-4], colorsB[i+1-4], colorsB[i+2-4]));
        } while(i = i - 4);

        avg = getAverage(diff);
        if(_debug) {
            // When debug is on, full data are computed and returned...
            max = getMaxOfArray(diff);
            min = getMinOfArray(diff);
            med = getMedian(diff);
            return [avg, med, max, min];
        }else {
            // Otherwise, only the average difference value is returned.
            return [avg];
        }
    };

    /**
     * Calculates the distance between 2 colors RGB compounds.
     * @param {number} RA Red compound value of color A.
     * @param {number} GA Green compound value of color A.
     * @param {number} BA Blue compound value of color A.
     * @param {number} RB Red compound value of color B.
     * @param {number} GB Green compound value of color B.
     * @param {number} BB Blue compound value of color B.
     * @return {number} The distance.
     */
    var getColorDistance = function(RA, GA, BA, RB, GB, BB) {
        return Math.sqrt(Math.pow(RA - RB, 2) + Math.pow(GA - GB, 2) + Math.pow(BA - BB, 2));
    };

    /**
     * Calculates the maximum value of an array.
     * @param {Array.<number>} numArray An array of values.
     * @return {number} The maximum value.
     */
    var getMaxOfArray = function(numArray) {
        return Math.max.apply(null, numArray);
    };

    /**
     * Calculates the minimum value of an array.
     * @param {Array.<number>} numArray An array of values.
     * @return {number} The minimum value.
     */
    var getMinOfArray = function(numArray) {
        return Math.min.apply(null, numArray);
    };

    /**
     * Calculates the average value of an array.
     * @param {Array.<number>} numArray An array of values.
     * @return {number} The average value.
     */
    var getAverage = function(numArray) {
        return numArray.reduce(function(a, b) {
            return a + b;
        }) / _step_sq;
    };

    var getMedian;

    /**
     * Comparison function for Array.sort() used in getMedian().
     * @param {number} a The first value to compare.
     * @param {number} b The second value to compare.
     * @return {number} The difference between a and b.
     */
    var compare = function(a, b) {
        return a - b;
    };
    
    init();
};
