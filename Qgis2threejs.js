// (C) 2014 Minoru Akagi
// SPDX-License-Identifier: MIT
// https://github.com/minorua/Qgis2threejs

"use strict";

var Q3D = {

	VERSION: "2.7.3",
	application: {},
	gui: {}

};

Q3D.Config = {

	// renderer
	renderer: {
		hiDpi: true       // HD-DPI support
	},

	texture: {
		anisotropy: -4    // zero means max available value. negative value means max / -v.
	},

	// scene
	autoAdjustCameraPos: true,  // automatic camera height adjustment
	bgColor: null,              // null is sky

	// camera
	orthoCamera: false,
	viewpoint: {      // z-up
		default: {      // assumed that origin is (0, 0, 0) and base extent width in 3D world coordinates is 1
			pos: new THREE.Vector3(0, -1, 1),
			lookAt: new THREE.Vector3()
		}
	},

	// light
	lights: {
		directional: [
			{
				type: "ambient",
				color: 0x999999,
				intensity: 0.8
			},
			{
				type: "directional",
				color: 0xffffff,
				intensity: 0.7,
				azimuth: 220,   // azimuth of light, in degrees. default light azimuth of gdaldem hillshade is 315.
				altitude: 45    // altitude angle in degrees.
			}
		],
		point: [
			{
				type: "ambient",
				color: 0x999999,
				intensity: 0.9
			},
			{
				type: "point",
				color: 0xffffff,
				intensity: 0.6,
				height: 10
			}
		]
	},

	// layer
	allVisible: false,   // set every layer visible property to true on load if set to true

	line: {
		dash: {
			dashSize: 1,
			gapSize: 0.5
		}
	},

	label: {
		visible: true,
		canvasHeight: 64,
		clickable: true
	},

	// widgets
	navigation: {
		enabled: true
	},

	northArrow: {
		color: 0x8b4513,
		cameraDistance: 30,
		enabled: false
	},

	// animation
	animation: {
		enabled: false,
		startOnLoad: false,
		easingCurve: "Cubic",
		repeat: false
	},

	// others
	qmarker: {
		radius: 0.004,
		color: 0xffff00,
		opacity: 0.8,
		k: 0.2    // size factor for ortho camera
	},

	measure: {
		marker: {
			radius: 0.004,
			color: 0xffff00,
			opacity: 0.5
			/* k: 0.2 */
		},
		line: {
			color: 0xffff00
		}
	},

	coord: {
		visible: true,
		latlon: false
	},

	potree: {},

	debugMode: false
};

// consts
Q3D.LayerType = {

	DEM: "dem",
	Point: "point",
	Line: "line",
	Polygon: "polygon",
	PointCloud: "pc"

};

Q3D.MaterialType = {

	MeshLambert: 0,
	MeshPhong: 1,
	MeshToon: 2,
	Line: 3,
	MeshLine: 4,
	Sprite: 5,
	Point: 6,
	MeshStandard: 7,
	Unknown: -1

};

Q3D.KeyframeType = {

	CameraMotion: 64,
	Opacity: 65,
	Texture: 66,
	GrowingLine: 67

};

Q3D.uv = {

	i: new THREE.Vector3(1, 0, 0),
	j: new THREE.Vector3(0, 1, 0),
	k: new THREE.Vector3(0, 0, 1)

};

Q3D.deg2rad = Math.PI / 180;

Q3D.ua = window.navigator.userAgent.toLowerCase();
Q3D.isTouchDevice = ("ontouchstart" in window);

Q3D.E = function (id) {
	return document.getElementById(id);
};


//load grid_area data
console.log('tesss');
/*
var retrieved_data = function getdata(){
    var tmp=null;
    $.ajax({
    	url: "data/index/grid_area.json",           
        type: 'GET',
		dataType: 'jsonp',
		CORS: true ,
		contentType:'application/json',
		secure: true,
		headers: {
		'Access-Control-Allow-Origin': '*',
		},
		beforeSend: function (xhr) {
		xhr.setRequestHeader ("Authorization", "Basic " + btoa(""));
		},
        success: function (data) {
          tmp=data;
        }
      })
    return tmp;
  }();
  */

(function () {

	var app = Q3D.application,
		gui = Q3D.gui,
		conf = Q3D.Config,
		E = Q3D.E;

	var vec3 = new THREE.Vector3();

	/*
	Q3D.application
	*/
	var listeners = {};
	app.dispatchEvent = function (event) {
		var ls = listeners[event.type] || [];
		for (var i = 0; i < ls.length; i++) {
			ls[i](event);
		}
	};

	app.addEventListener = function (type, listener, prepend) {
		listeners[type] = listeners[type] || [];
		if (prepend) {
			listeners[type].unshift(listener);
		}
		else {
			listeners[type].push(listener);
		}
	};

	app.removeEventListener = function (type, listener) {
		var array = listeners[type];
		if (array !== undefined) {
			var idx = array.indexOf(listener);
			if (idx !== -1) array.splice(idx, 1);
		}
	};

	app.init = function (container) {

		app.container = container;

		app.selectedObject = null;
		app.highlightObject = null;

		app.modelBuilders = [];
		app._wireframeMode = false;

		// URL parameters
		var params = app.parseUrlParameters();
		app.urlParams = params;

		if ("popup" in params) {
			// open popup window
			var c = window.location.href.split("?");
			window.open(c[0] + "?" + c[1].replace(/&?popup/, ""), "popup", "width=" + params.width + ",height=" + params.height);
			gui.popup.show("Another window has been opened.");
			return;
		}

		if (params.hiDpi == "no") conf.renderer.hiDpi = false;
		if (params.anisotropy) conf.texture.anisotropy = parseFloat(params.anisotropy);

		if (params.cx !== undefined) conf.viewpoint.pos = new THREE.Vector3(parseFloat(params.cx), parseFloat(params.cy), parseFloat(params.cz));
		if (params.tx !== undefined) conf.viewpoint.lookAt  = new THREE.Vector3(parseFloat(params.tx), parseFloat(params.ty), parseFloat(params.tz));

		if (params.width && params.height) {
			container.style.width = params.width + "px";
			container.style.height = params.height + "px";
		}

		app.width = container.clientWidth;
		app.height = container.clientHeight;

		var bgcolor = conf.bgColor;
		if (bgcolor === null) container.classList.add("sky");

		// WebGLRenderer
		app.renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});

		if (conf.renderer.hiDpi) {
			app.renderer.setPixelRatio(window.devicePixelRatio);
		}

		app.renderer.setSize(app.width, app.height);
		app.renderer.setClearColor(bgcolor || 0, (bgcolor === null) ? 0 : 1);
		app.container.appendChild(app.renderer.domElement);

		if (conf.texture.anisotropy <= 0) {
			var maxAnis = app.renderer.capabilities.getMaxAnisotropy() || 1;

			if (conf.texture.anisotropy == 0) {
				conf.texture.anisotropy = maxAnis;
			}
			else {
				conf.texture.anisotropy = (maxAnis > -conf.texture.anisotropy) ? -maxAnis / conf.texture.anisotropy : 1;
			}
		}

		// outline effect
		if (THREE.OutlineEffect !== undefined) app.effect = new THREE.OutlineEffect(app.renderer);

		// scene
		app.scene = new Q3DScene();

		app.scene.addEventListener("renderRequest", function (event) {
			app.render();
		});

		app.scene.addEventListener("cameraUpdateRequest", function (event) {
			app.camera.position.copy(event.pos);
			app.camera.lookAt(event.focal);
			if (app.controls.target !== undefined) app.controls.target.copy(event.focal);
			if (app.controls.saveState !== undefined) app.controls.saveState();

			if (event.far !== undefined) {
				app.camera.near = (app.camera.isOrthographicCamera) ? 0 : event.near;
				app.camera.far = event.far;
				app.camera.updateProjectionMatrix();
			}
		});

		app.scene.addEventListener("lightChanged", function (event) {
			if (event.light == "point") {
				app.scene.add(app.camera);
				app.camera.add(app.scene.lightGroup);
			}
			else {    // directional
				app.scene.remove(app.camera);
				app.scene.add(app.scene.lightGroup);
			}
		});

		app.scene.addEventListener("mapRotationChanged", function (event) {
			if (app.scene2) {
				app.scene2.lightGroup.clear();
				app.scene2.buildLights(Q3D.Config.lights.directional, event.rotation);
			}
		});

		// camera
		app.buildCamera(conf.orthoCamera);

		// controls
		if (THREE.OrbitControls) {
			app.controls = new THREE.OrbitControls(app.camera, app.renderer.domElement);

			app.controls.addEventListener("change", function (event) {
				app.render();
			});

			app.controls.update();
		}

		// navigation
		if (conf.navigation.enabled && typeof ViewHelper !== "undefined") {
			app.buildViewHelper(E("navigation"));
		}

		// north arrow
		if (conf.northArrow.enabled) {
			app.buildNorthArrow(E("northarrow"));
		}

		// labels
		app.labelVisible = conf.label.visible;

		// create a marker for queried point
		var opt = conf.qmarker;
		app.queryMarker = new THREE.Mesh(new THREE.SphereBufferGeometry(opt.radius, 32, 32),
										 new THREE.MeshLambertMaterial({color: opt.color, opacity: opt.opacity, transparent: (opt.opacity < 1)}));
		app.queryMarker.name = "marker";

		app.queryMarker.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
			this.scale.setScalar(this.position.distanceTo(camera.position) * ((camera.isPerspectiveCamera) ? 1 : conf.qmarker.k));
			this.updateMatrixWorld();
		};

		app.highlightMaterial = new THREE.MeshLambertMaterial({emissive: 0x999900, transparent: true, opacity: 0.5, side: THREE.DoubleSide});

		// loading manager
		app.initLoadingManager();

		// event listeners
		app.addEventListener("sceneLoaded", function () {
			if (conf.viewpoint.pos === undefined && conf.autoAdjustCameraPos) {
				app.adjustCameraPosition();
			}
			app.render();

			if (conf.animation.enabled) {
				var btn = E("animbtn");
				if (btn) {
					btn.className = "playbtn";
				}

				if (conf.animation.startOnLoad) {
					app.animation.keyframes.start();
				}
			}
		}, true);

		window.addEventListener("keydown", app.eventListener.keydown);
		window.addEventListener("resize", app.eventListener.resize);

		app.renderer.domElement.addEventListener("mousedown", app.eventListener.mousedown);
		app.renderer.domElement.addEventListener("mouseup", app.eventListener.mouseup);

		gui.init();
	};

	app.parseUrlParameters = function () {
		var p, vars = {};
		var params = window.location.search.substring(1).split('&').concat(window.location.hash.substring(1).split('&'));
		params.forEach(function (param) {
			p = param.split('=');
			vars[p[0]] = p[1];
		});
		return vars;
	};

	app.initLoadingManager = function () {
		if (app.loadingManager) {
			app.loadingManager.onLoad = app.loadingManager.onProgress = app.loadingManager.onError = undefined;
		}

		app.loadingManager = new THREE.LoadingManager(function () {   // onLoad
			app.loadingManager.isLoading = false;

			E("progressbar").classList.add("fadeout");

			app.dispatchEvent({type: "sceneLoaded"});
		},
		function (url, loaded, total) {   // onProgress
			E("progressbar").style.width = (loaded / total * 100) + "%";
		},
		function () {   // onError
			app.loadingManager.isLoading = false;

			app.dispatchEvent({type: "sceneLoadError"});
		});

		app.loadingManager.onStart = function () {
			app.loadingManager.isLoading = true;
		};

		app.loadingManager.isLoading = false;
	};

	app.loadFile = function (url, type, callback) {

		var loader = new THREE.FileLoader(app.loadingManager);
		loader.setResponseType(type);

		var onError = function (e) {
			if (location.protocol == "file:") {
				gui.popup.show("This browser doesn't allow loading local files via Ajax. See <a href='https://github.com/minorua/Qgis2threejs/wiki/Browser-Support'>plugin wiki page</a> for details.", "Error", true);
			}
		};

		try {
			loader.load(url, callback, undefined, onError);
		}
		catch (e) {      // for IE
			onError(e);
		}
	};

	app.loadJSONObject = function (jsonObject) {
		app.scene.loadJSONObject(jsonObject);
		if (jsonObject.animation !== undefined) app.animation.keyframes.load(jsonObject.animation.groups);
	};

	app.loadJSONFile = function (url, callback) {
		app.loadFile(url, "json", function (obj) {
			app.loadJSONObject(obj);
			if (callback) callback(obj);
		});
	};

	app.loadSceneFile = function (url, sceneFileLoadedCallback, sceneLoadedCallback) {

		var onload = function () {
			if (sceneFileLoadedCallback) sceneFileLoadedCallback(app.scene);
		};

		if (sceneLoadedCallback) {
			app.addEventListener("sceneLoaded", function () {
				sceneLoadedCallback(app.scene);
			});
		}

		var ext = url.split(".").pop();
		if (ext == "json") app.loadJSONFile(url, onload);
		else if (ext == "js") {
			var e = document.createElement("script");
			e.src = url;
			e.onload = onload;
			document.body.appendChild(e);
		}
	};

	app.loadTextureFile = function (url, callback) {
		return new THREE.TextureLoader(app.loadingManager).load(url, callback);
	};

	app.loadModelFile = function (url, callback) {
		var loader,
			ext = url.split(".").pop();

		if (ext == "dae") {
			loader = new THREE.ColladaLoader(app.loadingManager);
		}
		else if (ext == "gltf" || ext == "glb") {
			loader = new THREE.GLTFLoader(app.loadingManager);
		}
		else {
			console.log("Model file type not supported: " + url);
			return;
		}

		app.loadingManager.itemStart("M" + url);

		loader.load(url, function (model) {
			if (callback) callback(model);
			app.loadingManager.itemEnd("M" + url);
		},
		undefined,
		function (e) {
			console.log("Failed to load model: " + url);
			app.loadingManager.itemError("M" + url);
		});
	};

	app.loadModelData = function (data, ext, resourcePath, callback) {

		if (ext == "dae") {
			var model = new THREE.ColladaLoader(app.loadingManager).parse(data, resourcePath);
			if (callback) callback(model);
		}
		else if (ext == "gltf" || ext == "glb") {
			new THREE.GLTFLoader(app.loadingManager).parse(data, resourcePath, function (model) {
				if (callback) callback(model);
			}, function (e) {
				console.log("Failed to load a glTF model: " + e);
			});
		}
		else {
			console.log("Model file type not supported: " + ext);
			return;
		}
	};

	app.mouseDownPoint = new THREE.Vector2();
	app.mouseUpPoint = new THREE.Vector2();

	app.eventListener = {

		keydown: function (e) {
			if (e.ctrlKey) return;

			if (e.shiftKey) {
				switch (e.keyCode) {
					case 82:  // Shift + R
						app.controls.reset();
						return;
					case 83:  // Shift + S
						gui.showPrintDialog();
						return;
				}
				return;
			}

			switch (e.keyCode) {
				case 8:   // BackSpace
					if (app.measure.isActive) app.measure.removeLastPoint();
					return;
				case 13:  // Enter
					app.animation.keyframes.resume();
					return;
				case 27:  // ESC
					if (gui.popup.isVisible()) {
						app.cleanView();
					}
					else if (app.controls.autoRotate) {
						app.setRotateAnimationMode(false);
					}
					return;
				case 73:  // I
					gui.showInfo();
					return;
				case 76:  // L
					app.setLabelVisible(!app.labelVisible);
					return;
				case 82:  // R
					app.setRotateAnimationMode(!app.controls.autoRotate);
					return;
				case 87:  // W
					app.setWireframeMode(!app._wireframeMode);
					return;
			}
		},

		mousedown: function (e) {
			app.mouseDownPoint.set(e.clientX, e.clientY);
		},

		mouseup: function (e) {
			app.mouseUpPoint.set(e.clientX, e.clientY);
			if (app.mouseDownPoint.equals(app.mouseUpPoint)) app.canvasClicked(e);
		},

		resize: function () {
			app.setCanvasSize(app.container.clientWidth, app.container.clientHeight);
			app.render();
		}

	};

	app.setCanvasSize = function (width, height) {
		var changed = (app.width != width || app.height != height);

		app.width = width;
		app.height = height;
		app.camera.aspect = width / height;
		app.camera.updateProjectionMatrix();
		app.renderer.setSize(width, height);

		if (changed) app.dispatchEvent({type: "canvasSizeChanged"});
	};

	app.buildCamera = function (is_ortho) {
		if (is_ortho) {
			app.camera = new THREE.OrthographicCamera(-app.width / 10, app.width / 10, app.height / 10, -app.height / 10);
		}
		else {
			app.camera = new THREE.PerspectiveCamera(45, app.width / app.height);
		}

		// magic to change y-up world to z-up
		app.camera.up.set(0, 0, 1);

		var be = app.scene.userData.baseExtent;
		if (be) {
			app.camera.near = (is_ortho) ? 0 : 0.001 * be.width;
			app.camera.far = 100 * be.width;
			app.camera.updateProjectionMatrix();
		}
	};

	// move camera target to center of scene
	app.adjustCameraPosition = function (force) {
		if (!force) {
			app.render();

			// stay at current position if rendered objects exist
			var r = app.renderer.info.render;
			if (r.triangles + r.points + r.lines) return;
		}
		var bbox = app.scene.boundingBox();
		if (bbox.isEmpty()) return;

		bbox.getCenter(vec3);
		app.cameraAction.zoom(vec3.x, vec3.y, (bbox.max.z + vec3.z) / 2, app.scene.userData.baseExtent.width);
	};

	// declination: clockwise from +y, in degrees
	app.buildNorthArrow = function (container, declination) {
		container.style.display = "block";

		app.renderer2 = new THREE.WebGLRenderer({alpha: true, antialias: true});
		app.renderer2.setClearColor(0, 0);
		app.renderer2.setSize(container.clientWidth, container.clientHeight);

		app.container2 = container;
		app.container2.appendChild(app.renderer2.domElement);

		app.camera2 = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
		app.camera2.position.set(0, 0, conf.northArrow.cameraDistance);
		app.camera2.up = app.camera.up;

		app.scene2 = new Q3DScene();
		app.scene2.buildLights(conf.lights.directional, 0);

		// an arrow object
		var geometry = new THREE.Geometry();
		geometry.vertices.push(
			new THREE.Vector3(-5, -10, 0),
			new THREE.Vector3(0, 10, 0),
			new THREE.Vector3(0, -7, 3),
			new THREE.Vector3(5, -10, 0)
		);
		geometry.faces.push(
			new THREE.Face3(0, 1, 2),
			new THREE.Face3(2, 1, 3)
		);
		geometry.computeFaceNormals();

		var material = new THREE.MeshLambertMaterial({color: conf.northArrow.color, side: THREE.DoubleSide});
		var mesh = new THREE.Mesh(geometry, material);
		if (declination) mesh.rotation.z = -declination * Q3D.deg2rad;
		app.scene2.add(mesh);
	};

	app.buildViewHelper = function (container) {

		if (app.renderer3 === undefined) {
			container.style.display = "block";

			app.renderer3 = new THREE.WebGLRenderer({alpha: true, antialias: true});
			app.renderer3.setClearColor(0, 0);
			app.renderer3.setSize(container.clientWidth, container.clientHeight);

			app.container3 = container;
			app.container3.appendChild(app.renderer3.domElement);
		}

		if (app.viewHelper !== undefined) {
			app.viewHelper.removeEventListener("requestAnimation", app.startViewHelperAnimation);
		}

		app.viewHelper = new ViewHelper(app.camera, {dom: container});
		app.viewHelper.controls = app.controls;

		app.viewHelper.addEventListener("requestAnimation", app.startViewHelperAnimation);
	};

	var clock = new THREE.Clock();
	app.startViewHelperAnimation = function () {
		clock.start();
		requestAnimationFrame(app.animate);
	};

	app.currentViewUrl = function () {
		var c = app.scene.toMapCoordinates(app.camera.position),
			t = app.scene.toMapCoordinates(app.controls.target),
			hash = "#cx=" + c.x.toFixed(3) + "&cy=" + c.y.toFixed(3) + "&cz=" + c.z.toFixed(3);
		if (t.x || t.y || t.z) hash += "&tx=" + t.x.toFixed(3) + "&ty=" + t.y.toFixed(3) + "&tz=" + t.z.toFixed(3);
		return window.location.href.split("#")[0] + hash;
	};

	// enable the controls
	app.start = function () {
		if (app.controls) app.controls.enabled = true;
	};

	app.pause = function () {
		app.animation.isActive = false;
		if (app.controls) app.controls.enabled = false;
	};

	app.resume = function () {
		if (app.controls) app.controls.enabled = true;
	};

	// animation loop
	app.animate = function () {

		if (app.animation.isActive) {
			requestAnimationFrame(app.animate);

			if (app.animation.keyframes.isActive) TWEEN.update();
			else if (app.controls.enabled) app.controls.update();
		}
		else if (app.viewHelper && app.viewHelper.animating) {
			requestAnimationFrame(app.animate);

			app.viewHelper.update(clock.getDelta());
		}

		app.render();
	};

	app.animation = {

		isActive: false,

		start: function () {
			this.isActive = true;
			app.animate();
		},

		stop: function () {
			this.isActive = false;
		},

		keyframes: {    // keyframe animation

			isActive: false,

			isPaused: false,

			curveFactor: 0,

			easingFunction: function (easing) {
				if (easing == 1) return TWEEN.Easing.Linear.None;
				if (easing > 1) {
					var f = TWEEN.Easing[Q3D.Config.animation.easingCurve];
					if (easing == 2) return f["InOut"];
					else if (easing == 3) return f["In"];
					else return f["Out"];   // easing == 4
				}
			},

			keyframeGroups: [],

			clear: function () {
				this.keyframeGroups = [];
			},

			load: function (group) {
				if (!Array.isArray(group)) group = [group];

				this.keyframeGroups = this.keyframeGroups.concat(group);
			},

			start: function () {

				var _this = this,
					e = E("narrativebox"),
					btn = E("nextbtn"),
					currentNarElem;

				this.keyframeGroups.forEach(function (group) {

					var t;
					for (var p in Q3D.Tweens) {
						if (Q3D.Tweens[p].type == group.type) {
							t = Q3D.Tweens[p];
							break;
						}
					}
					if (t === undefined) {
						console.warn("unknown animation type: " + group.type);
						return;
					}

					var layer = (group.layerId !== undefined) ? app.scene.mapLayers[group.layerId] : undefined;

					group.completed = false;
					group.currentIndex = 0;
					group.prop_list = [];

					t.init(group, layer);

					var keyframes = group.keyframes;

					var showNBox = function (idx) {
						// narrative box
						var n = keyframes[idx].narration;
						if (n && e) {
							if (currentNarElem) {
								currentNarElem.classList.remove("visible");
							}

							currentNarElem = E(n.id);
							if (currentNarElem) {
								currentNarElem.classList.add("visible");
							}
							else {    // preview
								E("narbody").innerHTML = n.text;
							}

							if (btn) {
								if (idx < keyframes.length - 1) {
									btn.className = "nextbtn";
									btn.innerHTML =  "";
								}
								else {
									btn.className = "";
									btn.innerHTML = "Close";
								}
							}

							setTimeout(function () {
								_this.pause();
								e.classList.add("visible");
							}, 0);
						}
					};

					var onStart = function () {
						if (group.onStart) group.onStart();

						app.dispatchEvent({type: "tweenStarted", index: group.currentIndex});

						// pause if narrative box is shown
						if (e && e.classList.contains("visible")) {
							e.classList.remove("visible");
						}
					};

					var onComplete = function (obj) {
						if (!keyframes[group.currentIndex].easing) {
							group.onUpdate(obj, 1);
						}

						if (group.onComplete) group.onComplete(obj);

						var index = ++group.currentIndex;
						if (index == keyframes.length - 1) {
							group.completed = true;

							var completed = true;
							for (var i = 0; i < _this.keyframeGroups.length; i++) {
								if (!_this.keyframeGroups[i].completed) completed = false;
							}

							if (completed) {
								if (currentNarElem) {
									currentNarElem.classList.remove("visible");
								}

								if (conf.animation.repeat) {
									setTimeout(function () {
										_this.start();
									}, 0);
								}
								else {
									_this.stop();
								}
							}
						}

						// show narrative box if the current keyframe has a narrative content
						showNBox(index);
					};

					var t0, t1, t2;
					for (var i = 0; i < keyframes.length - 1; i++) {

						t2 = new TWEEN.Tween(group.prop_list[i]).delay(keyframes[i].delay).onStart(onStart)
										 .to(group.prop_list[i + 1], keyframes[i].duration).onComplete(onComplete);

						if (keyframes[i].easing) {
							t2.easing(_this.easingFunction(keyframes[i].easing)).onUpdate(group.onUpdate);
						}

						if (i == 0) {
							t0 = t2;
						}
						else {
							t1.chain(t2);
						}
						t1 = t2;
					}

					showNBox(0);

					t0.start();
				});

				app.animation.isActive = this.isActive = true;
				app.dispatchEvent({type: "animationStarted"});
				app.animate();
			},

			stop: function () {

				TWEEN.removeAll();

				app.animation.isActive = this.isActive = this.isPaused = false;
				this._pausedTweens = null;

				app.dispatchEvent({type: "animationStopped"});
			},

			pause: function () {

				if (this.isPaused) return;

				this._pausedTweens = TWEEN.getAll();

				if (this._pausedTweens.length) {
					for (var i = 0; i < this._pausedTweens.length; i++) {
						this._pausedTweens[i].pause();
					}
					this.isPaused = true;
				}
				app.animation.isActive = this.isActive = false;
			},

			resume: function () {

				var box = E("narrativebox");
				if (box && box.classList.contains("visible")) {
					box.classList.remove("visible");
				}

				if (!this.isPaused) return;

				for (var i = 0; i < this._pausedTweens.length; i++) {
					this._pausedTweens[i].resume();
				}
				this._pausedTweens = null;

				app.animation.isActive = this.isActive = true;
				this.isPaused = false;

				app.animate();
			}
		},

		orbit: {      // orbit animation

			isActive: false,

			start: function () {

				app.controls.autoRotate = true;
				app.animation.isActive = this.isActive = true;

				app.animate();
			},

			stop: function () {

				app.controls.autoRotate = false;
				app.animation.isActive = this.isActive = false;
			}
		}
	};

	app.render = function (updateControls) {
		if (updateControls) {
			app.controls.update();
		}

		if (app.camera.parent) {
			app.camera.updateMatrixWorld();
		}

		// render
		if (app.effect) {
			app.effect.render(app.scene, app.camera);
		}
		else {
			app.renderer.render(app.scene, app.camera);
		}

		// North arrow
		if (app.renderer2) {
			app.scene2.quaternion.copy(app.camera.quaternion).inverse();
			app.scene2.updateMatrixWorld();

			app.renderer2.render(app.scene2, app.camera2);
		}

		// navigation widget
		if (app.viewHelper) {
			app.viewHelper.render(app.renderer3);
		}
	};

	(function () {
		var dly, rpt, times, id = null;
		var func = function () {
			app.render();
			if (rpt <= ++times) {
				clearInterval(id);
				id = null;
			}
		};
		app.setIntervalRender = function (delay, repeat) {
			if (id === null || delay != dly) {
				if (id !== null) {
					clearInterval(id);
				}
				id = setInterval(func, delay);
				dly = delay;
			}
			rpt = repeat;
			times = 0;
		};
	})();

	app.setLabelVisible = function (visible) {
		app.labelVisible = visible;
		app.scene.labelGroup.visible = visible;
		app.scene.labelConnectorGroup.visible = visible;
		app.render();
	};

	app.setRotateAnimationMode = function (enabled) {
		if (enabled) {
			app.animation.orbit.start();
		}
		else {
			app.animation.orbit.stop();
		}
	};

	app.setWireframeMode = function (wireframe) {
		if (wireframe == app._wireframeMode) return;

		for (var id in app.scene.mapLayers) {
			app.scene.mapLayers[id].setWireframeMode(wireframe);
		}

		app._wireframeMode = wireframe;
		app.render();
	};

	app.intersectObjects = function (offsetX, offsetY) {
		var vec2 = new THREE.Vector2((offsetX / app.width) * 2 - 1,
								    -(offsetY / app.height) * 2 + 1);
		var ray = new THREE.Raycaster();
		ray.linePrecision = 0.2;
		ray.setFromCamera(vec2, app.camera);
		return ray.intersectObjects(app.scene.visibleObjects(app.labelVisible));
	};

	app._offset = function (elm) {
		var top = 0, left = 0;
		do {
			top += elm.offsetTop || 0; left += elm.offsetLeft || 0; elm = elm.offsetParent;
		} while (elm);
		return {top: top, left: left};
	};

	app.queryTargetPosition = new THREE.Vector3();

	app.cameraAction = {

		move: function (x, y, z) {
			if (x === undefined) app.camera.position.copy(app.queryTargetPosition);
			else app.camera.position.set(x, y, z);

			app.render(true);
			app.cleanView();
		},

		vecZoom: new THREE.Vector3(0, -1, 1).normalize(),

		zoom: function (x, y, z, dist) {
			if (x === undefined) vec3.copy(app.queryTargetPosition);
			else vec3.set(x, y, z);

			if (dist === undefined) dist = app.scene.userData.baseExtent.width * 0.1;

			app.camera.position.copy(app.cameraAction.vecZoom).multiplyScalar(dist).add(vec3);
			app.camera.lookAt(vec3);
			if (app.controls.target !== undefined) app.controls.target.copy(vec3);
			app.render(true);
			app.cleanView();
		},

		zoomToLayer: function (layer) {
			if (!layer) return;

			var bbox = layer.boundingBox();

			bbox.getSize(vec3);
			var dist = Math.max(vec3.x, vec3.y * 3 / 4) * 1.2;

			bbox.getCenter(vec3);
			app.cameraAction.zoom(vec3.x, vec3.y, vec3.z, dist);
		},

		orbit: function (x, y, z) {
			if (app.controls.target === undefined) return;

			if (x === undefined) app.controls.target.copy(app.queryTargetPosition);
			else app.controls.target.set(x, y, z);

			app.setRotateAnimationMode(true);
			app.cleanView();
		}

	};

	app.cleanView = function () {
		gui.clean();

		app.scene.remove(app.queryMarker);
		app.highlightFeature(null);
		app.measure.clear();
		app.forecast.clear();
		app.render();

		app.selectedLayer = null;

		if (app._canvasImageUrl) {
			URL.revokeObjectURL(app._canvasImageUrl);
			app._canvasImageUrl = null;
		}
	};

	app.cleanView_f = function () {
		gui.popupforecast.hide();
		if (gui.layerPanel.initialized) gui.layerPanel.hide();
	};

	app.highlightFeature = function (object) {
		if (app.highlightObject) {
			// remove highlight object from the scene
			app.scene.remove(app.highlightObject);
			app.selectedObject = null;
			app.highlightObject = null;
		}

		if (object === null) return;

		var layer = app.scene.mapLayers[object.userData.layerId];
		if (!layer || layer.type == Q3D.LayerType.DEM || layer.type == Q3D.LayerType.PointCloud) return;
		if (layer.properties.objType == "Billboard") return;

		// create a highlight object (if layer type is Point, slightly bigger than the object)
		var s = (layer.type == Q3D.LayerType.Point) ? 1.01 : 1;

		var clone = object.clone();
		clone.traverse(function (obj) {
			obj.material = app.highlightMaterial;
		});
		if (s != 1) clone.scale.multiplyScalar(s);

		// add the highlight object to the scene
		app.scene.add(clone);

		app.selectedObject = object;
		app.highlightObject = clone;
	};

	app.canvasClicked = function (e) {

		// button 2: right click
		if (e.button == 2 && app.measure.isActive) {
			app.measure.removeLastPoint();
			return;
		}

		var canvasOffset = app._offset(app.renderer.domElement);
		var objs = app.intersectObjects(e.clientX - canvasOffset.left, e.clientY - canvasOffset.top);

		var obj, o, layer, layerId, featureIdx;
		for (var i = 0, l = objs.length; i < l; i++) {
			obj = objs[i];

			if (app.measure.isActive) {
				app.measure.addPoint(obj.point);
				return;
			}

			// get layerId of clicked object
			o = obj.object;
			while (o) {
				layerId = o.userData.layerId;
				featureIdx = o.userData.featureIdx;
				if (layerId !== undefined) break;
				o = o.parent;
			}

			if (layerId === undefined) break;

			layer = app.scene.mapLayers[layerId];
			if (!layer.clickable) break;

			app.selectedLayer = layer;
			app.queryTargetPosition.copy(obj.point);

			// query marker
			app.queryMarker.position.copy(obj.point);
			app.scene.add(app.queryMarker);

			if (o.userData.isLabel) {
				o = o.userData.objs[o.userData.partIdx];    // label -> object
			}

			app.highlightFeature(o);
			app.render();
			gui.showQueryResult(obj.point, layer, featureIdx, o, conf.coord.visible);

			return;
		}
		if (app.measure.isActive) return;

		app.cleanView();

		if (app.controls.autoRotate) {
			app.setRotateAnimationMode(false);
		}
	};

	app.saveCanvasImage = function (width, height, fill_background, saveImageFunc) {
		if (fill_background === undefined) fill_background = true;

		// set canvas size
		var old_size;
		if (width && height) {
			old_size = [app.width, app.height];
			app.setCanvasSize(width, height);
		}

		// functions
		var saveBlob = function (blob) {
			var filename = "image.png";

			// ie
			if (window.navigator.msSaveBlob !== undefined) {
				window.navigator.msSaveBlob(blob, filename);
				gui.popup.hide();
			}
			else {
				// create object url
				if (app._canvasImageUrl) URL.revokeObjectURL(app._canvasImageUrl);
				app._canvasImageUrl = URL.createObjectURL(blob);

				// display a link to save the image
				var e = document.createElement("a");
				e.className = "download-link";
				e.href = app._canvasImageUrl;
				e.download = filename;
				e.innerHTML = "Save";
				gui.popup.show("Click to save the image to a file." + e.outerHTML, "Image is ready");
			}
		};

		var saveCanvasImage = saveImageFunc || function (canvas) {
			if (canvas.toBlob !== undefined) {
				canvas.toBlob(saveBlob);
			}
			else {    // !HTMLCanvasElement.prototype.toBlob
				// https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement.toBlob
				var binStr = atob(canvas.toDataURL("image/png").split(',')[1]),
					len = binStr.length,
					arr = new Uint8Array(len);

				for (var i = 0; i < len; i++) {
					arr[i] = binStr.charCodeAt(i);
				}

				saveBlob(new Blob([arr], {type: "image/png"}));
			}
		};

		var restoreCanvasSize = function () {
			// restore canvas size
			if (old_size) app.setCanvasSize(old_size[0], old_size[1]);
			app.render();
		};

		// background option
		if (!fill_background) app.renderer.setClearColor(0, 0);

		// render
		app.renderer.preserveDrawingBuffer = true;

		if (app.effect) {
			app.effect.render(app.scene, app.camera);
		}
		else {
			app.renderer.render(app.scene, app.camera);
		}

		// restore clear color
		var bgcolor = conf.bgColor;
		app.renderer.setClearColor(bgcolor || 0, (bgcolor === null) ? 0 : 1);

		if (fill_background && bgcolor === null) {
			var canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;

			var ctx = canvas.getContext("2d");
			if (fill_background && bgcolor === null) {
				// render "sky-like" background
				var grad = ctx.createLinearGradient(0, 0, 0, height);
				grad.addColorStop(0, "#98c8f6");
				grad.addColorStop(0.4, "#cbebff");
				grad.addColorStop(1, "#f0f9ff");
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, width, height);
			}

			var image = new Image();
			image.onload = function () {
				// draw webgl canvas image
				ctx.drawImage(image, 0, 0, width, height);

				// save canvas image
				saveCanvasImage(canvas);
				restoreCanvasSize();
			};
			image.src = app.renderer.domElement.toDataURL("image/png");
		}
		else {
			// save webgl canvas image
			saveCanvasImage(app.renderer.domElement);
			restoreCanvasSize();
		}
	};

	(function () {

		var path = [];

		app.measure = {

			isActive: false,

			precision: 3,

			start: function () {
				app.scene.remove(app.queryMarker);

				if (!this.geom) {
					var opt = conf.measure.marker;
					this.geom = new THREE.SphereBufferGeometry(opt.radius, 32, 32);
					this.mtl = new THREE.MeshLambertMaterial({color: opt.color, opacity: opt.opacity, transparent: (opt.opacity < 1)});
					opt = conf.measure.line;
					this.lineMtl = new THREE.LineBasicMaterial({color: opt.color});
					this.markerGroup = new Q3DGroup();
					this.markerGroup.name = "measure marker";
					this.lineGroup = new Q3DGroup();
					this.lineGroup.name = "measure line";
				}

				this.isActive = true;

				app.scene.add(this.markerGroup);
				app.scene.add(this.lineGroup);

				this.addPoint(app.queryTargetPosition);
			},

			addPoint: function (pt) {
				// add a marker
				var marker = new THREE.Mesh(this.geom, this.mtl);
				marker.position.copy(pt);
				marker.onBeforeRender = app.queryMarker.onBeforeRender;

				this.markerGroup.updateMatrixWorld();
				this.markerGroup.add(marker);

				path.push(marker.position);

				if (path.length > 1) {
					// add a line
					var v = path[path.length - 2].toArray().concat(path[path.length - 1].toArray()),
						geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(v, 3)),
						line = new THREE.Line(geom, this.lineMtl);
					this.lineGroup.add(line);
				}

				app.render();
				this.showResult();
			},

			removeLastPoint: function () {
				path.pop();
				this.markerGroup.children.pop();
				this.lineGroup.children.pop();

				app.render();

				if (path.length) this.showResult();
				else app.cleanView();
			},

			clear: function () {
				if (!this.isActive) return;

				this.markerGroup.clear();
				this.lineGroup.clear();

				app.scene.remove(this.markerGroup);
				app.scene.remove(this.lineGroup);

				path = [];
				this.isActive = false;
			},

			formatLength: function (length) {
				return (length) ? length.toFixed(this.precision) : 0;
			},

			showResult: function () {
				var vec2 = new THREE.Vector2(),
					zScale = app.scene.userData.zScale;
				var total = 0, totalxy = 0, dz = 0;
				if (path.length > 1) {
					var dxy;
					for (var i = path.length - 1; i > 0; i--) {
						dxy = vec2.copy(path[i]).distanceTo(path[i - 1]);
						dz = (path[i].z - path[i - 1].z) / zScale;

						total += Math.sqrt(dxy * dxy + dz * dz);
						totalxy += dxy;
					}
					dz = (path[path.length - 1].z - path[0].z) / zScale;
				}

				var html = '<table class="measure">';
				html += "<tr><td>Total distance:</td><td>" + this.formatLength(total) + " m</td><td></td></tr>";
				html += "<tr><td>Horizontal distance:</td><td>" + this.formatLength(totalxy) + " m</td><td></td></tr>";
				html += "<tr><td>Vertical difference:</td><td>" + this.formatLength(dz) + ' m</td><td><span class="tooltip tooltip-btn" data-tooltip="elevation difference between start point and end point">?</span></td></tr>';
				html += "</table>";

				gui.popup.show(html, "Measure distance");
			}
		};
	})();


	(function () {

		app.forecast = {

			isActive: false,

			start: function() {
				this.isActive = true;
			},
			
			clear: function () {
				if (!this.isActive) return;
				this.isActive = false;
			},

			showResult: function () {
				console.log('show modal of forecast');
				/*
				var html = '<table class="forecast">';
				html += "<tr><td>Total distance:</td><td>" + " m</td><td></td></tr>";
				html += "<tr><td>Horizontal distance:</td><td>" + " m</td><td></td></tr>";
				html += "<tr><td>Vertical difference:</td><td>" + ' m</td><td><span class="tooltip tooltip-btn" data-tooltip="elevation difference between start point and end point">?</span></td></tr>';
				html += "</table>";
    				*/
				var html = '';
				gui.popupforecast.show(html, "Forecast of Energy Demand");
			}
		}
	})();


	/*
	Q3D.gui
	*/
	var VIS = "visible";

	function CE(tagName, parent, innerHTML) {
		var elem = document.createElement(tagName);
		if (parent) parent.appendChild(elem);
		if (innerHTML) elem.innerHTML = innerHTML;
		return elem;
	}

	function ON_CLICK(id, listener) {
		var e = document.getElementById(id);
		if (e) e.addEventListener("click", listener);
	}

	gui.modules = [];

	gui.init = function () {
		// tool buttons
		ON_CLICK("layerbtn", function () {
			if (!gui.layerPanel.initialized) gui.layerPanel.init();

			if (gui.layerPanel.isVisible()) {
				gui.layerPanel.hide();
			}
			else {
				if (gui.popup.isVisible()) {
					gui.popup.hide();
				}
				gui.layerPanel.show();
			}
		});

		ON_CLICK("infobtn", function () {
			gui.layerPanel.hide();

			if (gui.popup.isVisible() && gui.popup.content == "pageinfo") gui.popup.hide();
			else gui.showInfo();
		});

		var btn = E("animbtn");
		if (conf.animation.enabled && btn) {
			var anim = app.animation.keyframes;

			var playButton = function () {
				btn.className = "playbtn";
			};

			var pauseButton = function () {
				btn.className = "pausebtn";
			};

			btn.onclick = function () {
				if (anim.isActive) {
					anim.pause();
					playButton();
				}
				else if (anim.isPaused) {
					anim.resume();
					pauseButton();
				}
				else anim.start();
			};

			app.addEventListener('animationStarted', pauseButton);
			app.addEventListener('animationStopped', playButton);
		}

		// popup
		ON_CLICK("closebtn", app.cleanView);
		ON_CLICK("closebtn_f", app.cleanView_f);
		ON_CLICK("zoomtolayer", function () {
			app.cameraAction.zoomToLayer(app.selectedLayer);
		});
		ON_CLICK("zoomtopoint", function () {
			app.cameraAction.zoom();
		});
		ON_CLICK("orbitbtn", function () {
			app.cameraAction.orbit();
		});
		ON_CLICK("measurebtn", function () {
			app.measure.start();
		});
		ON_CLICK("forecastbtn", function () {
			app.forecast.showResult();
			console.log('forecast!');
		});

		// narrative box
		ON_CLICK("nextbtn", function () {
			app.animation.keyframes.resume();
		});

		// attribution
		if (typeof proj4 === "undefined") {
			var e = E("lib_proj4js");
			if (e) e.classList.add("hidden");
		}

		// initialize modules
		for (var i = 0; i < gui.modules.length; i++) {
			gui.modules[i].init();
		}
	};

	gui.clean = function () {
		gui.popup.hide();
		gui.popupforecast.hide();
		
		if (gui.layerPanel.initialized) gui.layerPanel.hide();
	};

	gui.popup = {

		modal: false,

		content: null,

		timerId: null,

		isVisible: function () {
			return E("popup").classList.contains(VIS);
		},

		// show box
		// obj: html, element or content id ("queryresult" or "pageinfo")
		// modal: boolean
		// duration: int [milliseconds]
		show: function (obj, title, modal, duration) {

			if (modal) app.pause();
			else if (this.modal) app.resume();

			this.content = obj;
			this.modal = Boolean(modal);

			var e = E("layerpanel");
			if (e) e.classList.remove(VIS);

			var content = E("popupcontent");
			[content, E("queryresult"), E("pageinfo")].forEach(function (e) {
				if (e) e.classList.remove(VIS);
			});

			if (obj == "queryresult" || obj == "pageinfo") {
				E(obj).classList.add(VIS);
			}
			else {
				if (obj instanceof HTMLElement) {
					content.innerHTML = "";
					content.appendChild(obj);
				}
				else {
					content.innerHTML = obj;
				}
				content.classList.add(VIS);
			}
			E("popupbar").innerHTML = title || "";
			E("popup").classList.add(VIS);

			if (this.timerId !== null) {
				clearTimeout(this.timerId);
				this.timerId = null;
			}

			if (duration) {
				this.timerId = setTimeout(function () {
					gui.popup.hide();
				}, duration);
			}
		},

		hide: function () {
			E("popup").classList.remove(VIS);
			if (this.timerId !== null) clearTimeout(this.timerId);
			this.timerId = null;
			this.content = null;
			if (this.modal) app.resume();
		}

	};

	gui.popupforecast = {

		modal: false,

		content: null,

		timerId: null,

		isVisible: function () {
			return E("popup_forecast").classList.contains(VIS);
		},

		show: function (obj, title, modal, duration) {
			E("popup_forecast").classList.add(VIS);
		},

		hide: function () {
			console.log('forecast hidden');
			E("popup_forecast").classList.remove(VIS);
			if (this.timerId !== null) clearTimeout(this.timerId);
			this.timerId = null;
			this.content = null;
			if (this.modal) app.resume();
		}

	};

	

	gui.showInfo = function () {
		var e = E("urlbox");
		if (e) e.value = app.currentViewUrl();
		gui.popup.show("pageinfo");
	};

	gui.showQueryResult = function (point, layer, featureId, obj, show_coords) {
		// layer name
		var e = E("qr_layername");
		var x = layer.features[featureId].geom.centroids[0][0];
		var y = layer.features[featureId].geom.centroids[0][1];
		var x1 = app.scene.toMapCoordinates({"x": x,"y": y,"z": 250}).x;
		var y1 = app.scene.toMapCoordinates({"x": x,"y": y,"z": 250}).y;
		var da = retrieved_data[featureId];
		
		if (layer && e) e.innerHTML = 'House: '+(da["House_PCT"]*100).toFixed(2).toString()
					      +' % <br> Factory :'+(da["Factory__1"]*100).toFixed(2).toString()                      
			                      +' % <br> Gov. Building :'+(da["Govern_PCT"]*100).toFixed(2).toString()
			                      +' % <br> Comm. Building :'+(da["Commerc_PC"]*100).toFixed(2).toString()
					      +' % <br> Park :'+(da["Park_PCT"]*100).toFixed(2).toString()			                      
					      +' %';   
		
		// clicked coordinates
		e = E("qr_coords_table");
		if (e) {
			if (show_coords) {
				e.classList.remove("hidden");

				var pt = app.scene.toMapCoordinates(point);

				e = E("qr_coords");

				if (conf.coord.latlon) {
					var lonLat = proj4(app.scene.userData.proj).inverse([pt.x, pt.y]);
					e.innerHTML = Q3D.Utils.convertToDMS(lonLat[1], lonLat[0]) + ", Elev. " + pt.z.toFixed(2);
				}
				else {
					proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
					proj4.defs("EPSG:5171", "+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs");
					//var firstProjection =';
					var new_xy = proj4("EPSG:5171","EPSG:4326", [pt.x,pt.y]);
					e.innerHTML = [new_xy[0].toFixed(3), new_xy[1].toFixed(3), pt.z.toFixed(0)].join(", ");
				}

				if (conf.debugMode) {
					var p = app.scene.userData,
						be = p.baseExtent;
					e.innerHTML += "<br>WLD: " + [point.x.toFixed(8), point.y.toFixed(8), point.z.toFixed(8)].join(", ");
					e.innerHTML += "<br><br>ORG: " + [p.origin.x.toFixed(8), p.origin.y.toFixed(8), p.origin.z.toFixed(8)].join(", ");
					e.innerHTML += "<br>BE CNTR: " + [be.cx.toFixed(8), be.cy.toFixed(8)].join(", ");
					e.innerHTML += "<br>BE SIZE: " + [be.width.toFixed(8), be.height.toFixed(8)].join(", ");
					e.innerHTML += "<br>ROT: " + be.rotation + "<br>Z SC: " + p.zScale;
				}
			}
			else {
				e.classList.add("hidden");
			}
		}

		e = E("qr_attrs_table");
		if (e) {
			for (var i = e.children.length - 1; i >= 0; i--) {
				if (e.children[i].tagName.toUpperCase() == "TR") e.removeChild(e.children[i]);
			}

			if (layer && layer.properties.propertyNames !== undefined) {
				var row;
				for (var i = 0, l = layer.properties.propertyNames.length; i < l; i++) {
					row = document.createElement("tr");
					row.innerHTML = "<td>" + layer.properties.propertyNames[i] + "</td>" +
									"<td>" + obj.userData.properties[i] + "</td>";
					e.appendChild(row);
				}
				e.classList.remove("hidden");
			}
			else {
				e.classList.add("hidden");
			}
		}
		gui.popup.show("queryresult");
	};

	gui.showPrintDialog = function () {

		var f = CE("form");
		f.className = "print";

		var d1 = CE("div", f, "Image Size");
		d1.style.textDecoration = "underline";

		var d2 = CE("div", f),
			l1 = CE("label", d2, "Width:"),
			width = CE("input", d2);
		d2.style.cssFloat = "left";
		l1.htmlFor = width.id = width.name = "printwidth";
		width.type = "text";
		width.value = app.width;
		CE("span", d2, "px,");

		var d3 = CE("div", f),
			l2 = CE("label", d3, "Height:"),
			height = CE("input", d3);
		l2.htmlFor = height.id = height.name = "printheight";
		height.type = "text";
		height.value = app.height;
		CE("span", d3, "px");

		var d4 = CE("div", f),
			ka = CE("input", d4);
		ka.type = "checkbox";
		ka.checked = true;
		CE("span", d4, "Keep Aspect Ratio");

		var d5 = CE("div", f, "Option");
		d5.style.textDecoration = "underline";

		var d6 = CE("div", f),
			bg = CE("input", d6);
		bg.type = "checkbox";
		bg.checked = true;
		CE("span", d6, "Fill Background");

		var d7 = CE("div", f),
			ok = CE("span", d7, "OK"),
			cancel = CE("span", d7, "Cancel");
		d7.className = "buttonbox";

		CE("input", f).type = "submit";

		// event handlers
		// width and height boxes
		var aspect = app.width / app.height;

		width.oninput = function () {
			if (ka.checked) height.value = Math.round(width.value / aspect);
		};

		height.oninput = function () {
			if (ka.checked) width.value = Math.round(height.value * aspect);
		};

		ok.onclick = function () {
			gui.popup.show("Rendering...");
			window.setTimeout(function () {
				app.saveCanvasImage(width.value, height.value, bg.checked);
			}, 10);
		};

		cancel.onclick = app.cleanView;

		// enter key pressed
		f.onsubmit = function () {
			ok.onclick();
			return false;
		};

		gui.popup.show(f, "Save Image", true);   // modal
	};

	gui.layerPanel = {

		init: function () {
			var panel = E("layerpanel");

			var p, item, e, slider, o, select, i;
			Object.keys(app.scene.mapLayers).forEach(function (layerId) {

				var layer = app.scene.mapLayers[layerId];
				p = layer.properties;
				item = CE("div", panel);
				item.className = "layer";

				// visible
				e = CE("div", item, "<input type='checkbox'" +  ((p.visible) ? " checked" : "") + ">" + p.name);
				e.querySelector("input[type=checkbox]").addEventListener("change", function () {
					layer.visible = this.checked;
				});

				// opacity slider
				e = CE("div", item, "Opacity: <input type='range'><output></output>");
				slider = e.querySelector("input[type=range]");

				var label = e.querySelector("output");

				o = parseInt(layer.opacity * 100);
				slider.value = o;
				slider.addEventListener("input", function () {
					label.innerHTML = this.value + " %";
				});
				slider.addEventListener("change", function () {
					label.innerHTML = this.value + " %";
					layer.opacity = this.value / 100;
				});
				label.innerHTML = o + " %";

				// material dropdown
				if (p.mtlNames && p.mtlNames.length > 1) {
					select = CE("select", CE("div", item, "Material: "));
					for (i = 0; i < p.mtlNames.length; i++) {
						CE("option", select, p.mtlNames[i]).setAttribute("value", i);
					}
					select.value = p.mtlIdx;
					select.addEventListener("change", function () {
						layer.setCurrentMaterial(this.value);
					});
				}
			});
			gui.layerPanel.initialized = true;
		},

		isVisible: function () {
			return E("layerpanel").classList.contains(VIS);
		},

		show: function () {
			E("layerpanel").classList.add(VIS);
		},

		hide: function () {
			E("layerpanel").classList.remove(VIS);
		}

	};

})();


// Q3D classes

class Q3DGroup extends THREE.Group {

	add(object) {
		super.add(object);
		object.updateMatrixWorld();
	}

	clear() {
		for (var i = this.children.length - 1; i >= 0; i--) {
			this.remove(this.children[i]);
		}
	}

}


/*
Q3DScene
.userData
	- baseExtent(cx, cy, width, height, rotation): map base extent in map coordinates. center is (cx, cy).
	- origin: origin of 3D world in map coordinates
	- zScale: vertical scale factor
	- proj: (optional) proj string. used to display clicked position in long/lat.
*/
class Q3DScene extends THREE.Scene {

	constructor() {
		super();

		this.autoUpdate = false;

		this.mapLayers = {};    // map layers contained in this scene. key is layerId.

		this.lightGroup = new Q3DGroup();
		this.lightGroup.name = "light";
		this.add(this.lightGroup);

		this.labelGroup = new Q3DGroup();
		this.labelGroup.name = "label";
		this.add(this.labelGroup);

		this.labelConnectorGroup = new Q3DGroup();
		this.labelConnectorGroup.name = "label connector";
		this.add(this.labelConnectorGroup);
	}

	add(object) {
		super.add(object);
		object.updateMatrixWorld();
	}

	loadJSONObject(jsonObject) {
		if (jsonObject.type == "scene") {
			var p = jsonObject.properties;
			if (p !== undefined) {
				// fog
				if (p.fog) {
					this.fog = new THREE.FogExp2(p.fog.color, p.fog.density);
				}

				// light
				var rotation0 = (this.userData.baseExtent) ? this.userData.baseExtent.rotation : 0;
				if (p.light != this.userData.light || p.baseExtent.rotation != rotation0) {
					this.lightGroup.clear();
					this.buildLights(Q3D.Config.lights[p.light] || Q3D.Config.lights.directional, p.baseExtent.rotation);
					this.dispatchEvent({type: "lightChanged", light: p.light});
				}

				var be = p.baseExtent;
				p.pivot = new THREE.Vector3(be.cx, be.cy, p.origin.z).sub(p.origin);   // 2D center of extent in 3D world coordinates

				// set initial camera position and parameters
				if (this.userData.origin === undefined) {

					var s = be.width,
						v = Q3D.Config.viewpoint,
						pos, focal;

					if (v.pos === undefined) {
						v = v.default;
						if (be.rotation) {
							v = {
								pos: v.pos.clone().applyAxisAngle(Q3D.uv.k, be.rotation * Q3D.deg2rad),
								lookAt: v.lookAt.clone().applyAxisAngle(Q3D.uv.k, be.rotation * Q3D.deg2rad)
							};
						}
						pos = v.pos.clone().multiplyScalar(s).add(p.pivot);
						focal = v.lookAt.clone().multiplyScalar(s).add(p.pivot);
					}
					else {
						pos = new THREE.Vector3().copy(v.pos).sub(p.origin);
						focal = new THREE.Vector3().copy(v.lookAt).sub(p.origin);
					}

					pos.z *= p.zScale;
					focal.z *= p.zScale;

					var near = 0.001 * s,
						far = 100 * s;

					this.requestCameraUpdate(pos, focal, near, far);
				}

				if (p.baseExtent.rotation != rotation0) {
					this.dispatchEvent({type: "mapRotationChanged", rotation: p.baseExtent.rotation});
				}

				this.userData = p;
			}

			// load layers
			if (jsonObject.layers !== undefined) {
				jsonObject.layers.forEach(function (layer) {
					this.loadJSONObject(layer);
				}, this);
			}
		}
		else if (jsonObject.type == "layer") {
			var layer = this.mapLayers[jsonObject.id];
			if (layer === undefined) {
				// create a layer
				var type = jsonObject.properties.type;
				if (type == "dem") layer = new Q3DDEMLayer();
				else if (type == "point") layer = new Q3DPointLayer();
				else if (type == "line") layer = new Q3DLineLayer();
				else if (type == "polygon") layer = new Q3DPolygonLayer();
				else if (type == "pc") layer = new Q3DPointCloudLayer();
				else {
					console.error("unknown layer type:" + type);
					return;
				}
				layer.id = jsonObject.id;
				layer.objectGroup.userData.layerId = jsonObject.id;
				layer.addEventListener("renderRequest", this.requestRender.bind(this));

				this.mapLayers[jsonObject.id] = layer;
				this.add(layer.objectGroup);
			}

			layer.loadJSONObject(jsonObject, this);

			this.requestRender();
		}
		else if (jsonObject.type == "block") {
			var layer = this.mapLayers[jsonObject.layer];
			if (layer === undefined) {
				// console.error("layer not exists:" + jsonObject.layer);
				return;
			}
			layer.loadJSONObject(jsonObject, this);

			this.requestRender();
		}
	}

	buildLights(lights, rotation) {
		var p, light;
		for (var i = 0; i < lights.length; i++) {
			p = lights[i];
			if (p.type == "ambient") {
				light = new THREE.AmbientLight(p.color, p.intensity);
			}
			else if (p.type == "directional") {
				light = new THREE.DirectionalLight(p.color, p.intensity);
				light.position.copy(Q3D.uv.j)
								.applyAxisAngle(Q3D.uv.i, p.altitude * Q3D.deg2rad)
								.applyAxisAngle(Q3D.uv.k, (rotation - p.azimuth) * Q3D.deg2rad);
			}
			else if (p.type == "point") {
				light = new THREE.PointLight(p.color, p.intensity);
				light.position.set(0, 0, p.height);
			}
			else {
				continue;
			}
			this.lightGroup.add(light);
		}
	}

	requestRender() {
		this.dispatchEvent({type: "renderRequest"});
	}

	requestCameraUpdate(pos, focal, near, far) {
		this.dispatchEvent({type: "cameraUpdateRequest", pos: pos, focal: focal, near: near, far: far});
	}

	visibleObjects(labelVisible) {
		var layer, objs = [];
		for (var id in this.mapLayers) {
			layer = this.mapLayers[id];
			if (layer.visible) {
				objs = objs.concat(layer.visibleObjects());
				if (labelVisible && layer.labels) objs = objs.concat(layer.labels);
			}
		}
		return objs;
	}

	// 3D world coordinates to map coordinates
	toMapCoordinates(pt) {
		var p = this.userData;
		return {
			x: p.origin.x + pt.x,
			y: p.origin.y + pt.y,
			z: p.origin.z + pt.z / p.zScale
		};
	}

	// map coordinates to 3D world coordinates
	toWorldCoordinates(pt, isLonLat) {
		var p = this.userData;
		if (isLonLat && typeof proj4 !== "undefined") {
			// WGS84 long,lat to map coordinates
			var t = proj4(p.proj).forward([pt.x, pt.y]);
			pt = {x: t[0], y: t[1], z: pt.z};
		}

		return {
			x: pt.x - p.origin.x,
			y: pt.y - p.origin.y,
			z: (pt.z - p.origin.z) * p.zScale
		};
	}

	// return bounding box in 3d world coordinates
	boundingBox() {
		var box = new THREE.Box3();
		for (var id in this.mapLayers) {
			if (this.mapLayers[id].visible) {
				box.union(this.mapLayers[id].boundingBox());
			}
		}
		return box;
	}

}


class Q3DMaterial {

	constructor() {
		this.loaded = false;
	}

	// material: a THREE.Material-based object
	set(material) {
		this.mtl = material;
		this.origProp = {};
		return this;
	}

	// callback is called when material has been completely loaded
	loadJSONObject(jsonObject, callback) {
		this.origProp = jsonObject;
		this.groupId = jsonObject.mtlIndex;

		var m = jsonObject, opt = {}, defer = false;

		if (m.ds) opt.side = THREE.DoubleSide;

		if (m.flat) opt.flatShading = true;

		// texture
		if (m.image !== undefined) {
			var _this = this;
			if (m.image.url !== undefined) {
				opt.map = Q3D.application.loadTextureFile(m.image.url, function () {
					_this._loadCompleted(callback);
				});
				defer = true;
			}
			else if (m.image.object !== undefined) {    // WebKit Bridge
				opt.map = new THREE.Texture(m.image.object.toImageData());
				opt.map.needsUpdate = true;

				delete m.image.object;
			}
			else {    // base64
				var img = new Image();
				img.onload = function () {
					opt.map.needsUpdate = true;
					_this._loadCompleted(callback);
				};
				img.src = m.image.base64;
				opt.map = new THREE.Texture(img);
				defer = true;

				delete m.image.base64;
			}
			opt.map.anisotropy = Q3D.Config.texture.anisotropy;
		}

		if (m.c !== undefined) opt.color = m.c;

		if (m.o !== undefined && m.o < 1) {
			opt.opacity = m.o;
			opt.transparent = true;
		}

		if (m.t) opt.transparent = true;

		if (m.w) opt.wireframe = true;

		if (m.bm) {
			this.mtl = new THREE.MeshBasicMaterial(opt);
		}
		else if (m.type == Q3D.MaterialType.MeshLambert) {
			this.mtl = new THREE.MeshLambertMaterial(opt);
		}
		else if (m.type == Q3D.MaterialType.MeshPhong) {
			this.mtl = new THREE.MeshPhongMaterial(opt);
		}
		else if (m.type == Q3D.MaterialType.MeshToon) {
			this.mtl = new THREE.MeshToonMaterial(opt);
		}
		else if (m.type == Q3D.MaterialType.Point) {
			opt.size = m.s;
			this.mtl = new THREE.PointsMaterial(opt);
		}
		else if (m.type == Q3D.MaterialType.Line) {

			if (m.dashed) {
				opt.dashSize = Q3D.Config.line.dash.dashSize;
				opt.gapSize = Q3D.Config.line.dash.gapSize;
				this.mtl = new THREE.LineDashedMaterial(opt);
			}
			else {
				this.mtl = new THREE.LineBasicMaterial(opt);
			}
		}
		else if (m.type == Q3D.MaterialType.MeshLine) {

			opt.lineWidth = m.thickness;
			if (m.dashed) {
				opt.dashArray = 0.03;
				opt.dashRatio = 0.45;
				opt.dashOffset = 0.015;
				opt.transparent = true;
			}
			// opt.sizeAttenuation = 1;

			var mtl = this.mtl = new MeshLineMaterial(opt);
			var updateAspect = this._listener = function () {
				mtl.resolution = new THREE.Vector2(Q3D.application.width, Q3D.application.height);
			};

			updateAspect();
			Q3D.application.addEventListener("canvasSizeChanged", updateAspect);
		}
		else if (m.type == Q3D.MaterialType.Sprite) {
			opt.color = 0xffffff;
			this.mtl = new THREE.SpriteMaterial(opt);
		}
		else {
			if (m.roughness !== undefined) opt.roughness = m.roughness;
			if (m.metalness !== undefined) opt.metalness = m.metalness;

			this.mtl = new THREE.MeshStandardMaterial(opt);
		}

		if (!defer) this._loadCompleted(callback);
	}

	_loadCompleted(anotherCallback) {
		this.loaded = true;

		if (this._callbacks !== undefined) {
			for (var i = 0; i < this._callbacks.length; i++) {
				this._callbacks[i]();
			}
			this._callbacks = [];
		}

		if (anotherCallback) anotherCallback();
	}

	callbackOnLoad(callback) {
		if (this.loaded) return callback();

		if (this._callbacks === undefined) this._callbacks = [];
		this._callbacks.push(callback);
	}

	dispose() {
		if (!this.mtl) return;

		if (this.mtl.map) this.mtl.map.dispose();   // dispose of texture
		this.mtl.dispose();
		this.mtl = null;

		if (this._listener) {
			Q3D.application.removeEventListener("canvasSizeChanged", this._listener);
			this._listener = undefined;
		}
	}
}


class Q3DMaterials extends THREE.EventDispatcher {

	constructor() {
		super();
		this.array = [];
	}

	// material: instance of Q3DMaterial object or THREE.Material-based object
	add(material) {
		if (material instanceof Q3DMaterial) {
			this.array.push(material);
		}
		else {
			this.array.push(new Q3DMaterial().set(material));
		}
	}

	get(index) {
		return this.array[index];
	}

	mtl(index) {
		return this.array[index].mtl;
	}

	loadJSONObject(jsonObject) {
		var _this = this, iterated = false;
		var callback = function () {
			if (iterated) _this.dispatchEvent({type: "renderRequest"});
		};

		for (var i = 0, l = jsonObject.length; i < l; i++) {
			var mtl = new Q3DMaterial();
			mtl.loadJSONObject(jsonObject[i], callback);
			this.add(mtl);
		}
		iterated = true;
	}

	dispose() {
		for (var i = 0, l = this.array.length; i < l; i++) {
			this.array[i].dispose();
		}
		this.array = [];
	}

	addFromObject3D(object) {
		var mtls = [];

		object.traverse(function (obj) {
			if (obj.material === undefined) return;
			((obj.material instanceof Array) ? obj.material : [obj.material]).forEach(function (mtl) {
				if (mtls.indexOf(mtl) == -1) {
					mtls.push(mtl);
				}
			});
		});

		for (var i = 0, l = mtls.length; i < l; i++) {
			this.array.push(new Q3DMaterial().set(mtls[i]));
		}
	}

	// opacity
	opacity() {
		if (this.array.length == 0) return 1;

		var sum = 0;
		for (var i = 0, l = this.array.length; i < l; i++) {
			sum += this.array[i].mtl.opacity;
		}
		return sum / this.array.length;
	}

	setOpacity(opacity) {
		var m;
		for (var i = 0, l = this.array.length; i < l; i++) {
			m = this.array[i];
			m.mtl.transparent = Boolean(m.origProp.t) || (opacity < 1);
			m.mtl.opacity = opacity;
		}
	}

	// wireframe: boolean
	setWireframeMode(wireframe) {
		var m;
		for (var i = 0, l = this.array.length; i < l; i++) {
			m = this.array[i];
			if (m.origProp.w || m.mtl instanceof THREE.LineBasicMaterial) continue;
			m.mtl.wireframe = wireframe;
		}
	}

	removeItem(material, dispose) {
		for (var i = this.array.length - 1; i >= 0; i--) {
			if (this.array[i].mtl === material) {
				this.array.splice(i, 1);
				break;
			}
		}
		if (dispose) material.dispose();
	}

	removeGroupItems(groupId) {
		for (var i = this.array.length - 1; i >= 0; i--) {
			if (this.array[i].groupId === groupId) {
				this.array.splice(i, 1);
			}
		}
	}

}


class Q3DDEMBlockBase {

	constructor() {
		this.materials = [];
		this.currentMtlIndex = 0;
	}

	loadJSONObject(obj, layer, callback) {
		this.data = obj;

		// load material
		var m, mtl;
		for (var i = 0, l = (obj.materials || []).length; i < l; i++) {
			m = obj.materials[i];

			mtl = new Q3DMaterial();
			mtl.loadJSONObject(m, function () {
				layer.requestRender();
			});
			this.materials[m.mtlIndex] = mtl;

			if (m.useNow) {
				this.currentMtlIndex = m.mtlIndex;
				if (this.obj) {
					layer.materials.removeItem(this.obj.material, true);

					this.obj.material = mtl.mtl;
					layer.requestRender();
				}
				layer.materials.add(mtl);
			}
		}
	}

}


class Q3DDEMBlock extends Q3DDEMBlockBase {

	loadJSONObject(obj, layer, callback) {
		super.loadJSONObject(obj, layer, callback);

		if (obj.grid === undefined) return;

		// create a plane geometry
		var geom, grid = obj.grid;
		if (layer.geometryCache) {
			var params = layer.geometryCache.parameters || {};
			if (params.width === obj.width && params.height === obj.height &&
				params.widthSegments === grid.width - 1 && params.heightSegments === grid.height - 1) {

				geom = layer.geometryCache.clone();
				geom.parameters = layer.geometryCache.parameters;
			}
		}
		geom = geom || new THREE.PlaneBufferGeometry(obj.width, obj.height, grid.width - 1, grid.height - 1);
		layer.geometryCache = geom;

		// create a mesh
		var mesh = new THREE.Mesh(geom, (this.materials[this.currentMtlIndex] || {}).mtl);
		mesh.position.fromArray(obj.translate);
		mesh.scale.z = obj.zScale;
		layer.addObject(mesh);

		// set z values
		var buildGeometry = function (grid_values) {
			var vertices = geom.attributes.position.array;
			for (var i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
				vertices[j + 2] = grid_values[i];
			}
			geom.attributes.position.needsUpdate = true;
			geom.computeVertexNormals();

			if (callback) callback(mesh);
		};

		if (grid.url !== undefined) {
			Q3D.application.loadFile(grid.url, "arraybuffer", function (buf) {
				grid.array = new Float32Array(buf);
				buildGeometry(grid.array);
			});
		}
		else {
			if (grid.binary !== undefined) {
				// WebKit Bridge
				grid.array = new Float32Array(grid.binary.buffer, 0, grid.width * grid.height);
			}
			buildGeometry(grid.array);
		}

		this.obj = mesh;
		return mesh;
	}

	buildSides(layer, parent, material, z0) {
		var planeWidth = this.data.width,
			planeHeight = this.data.height,
			grid = this.data.grid,
			grid_values = grid.array,
			w = grid.width,
			h = grid.height,
			k = w * (h - 1);

		var band_width = -2 * z0;

		// front and back
		var geom_fr = new THREE.PlaneBufferGeometry(planeWidth, band_width, w - 1, 1),
			geom_ba = geom_fr.clone();

		var vertices_fr = geom_fr.attributes.position.array,
			vertices_ba = geom_ba.attributes.position.array;

		var i, mesh;
		for (i = 0; i < w; i++) {
			vertices_fr[i * 3 + 1] = grid_values[k + i];
			vertices_ba[i * 3 + 1] = grid_values[w - 1 - i];
		}
		mesh = new THREE.Mesh(geom_fr, material);
		mesh.rotation.x = Math.PI / 2;
		mesh.position.y = -planeHeight / 2;
		mesh.name = "side";
		parent.add(mesh);

		mesh = new THREE.Mesh(geom_ba, material);
		mesh.rotation.x = Math.PI / 2;
		mesh.rotation.y = Math.PI;
		mesh.position.y = planeHeight / 2;
		mesh.name = "side";
		parent.add(mesh);

		// left and right
		var geom_le = new THREE.PlaneBufferGeometry(band_width, planeHeight, 1, h - 1),
			geom_ri = geom_le.clone();

		var vertices_le = geom_le.attributes.position.array,
			vertices_ri = geom_ri.attributes.position.array;

		for (i = 0; i < h; i++) {
			vertices_le[(i * 2 + 1) * 3] = grid_values[w * i];
			vertices_ri[i * 2 * 3] = -grid_values[w * (i + 1) - 1];
		}
		mesh = new THREE.Mesh(geom_le, material);
		mesh.rotation.y = -Math.PI / 2;
		mesh.position.x = -planeWidth / 2;
		mesh.name = "side";
		parent.add(mesh);

		mesh = new THREE.Mesh(geom_ri, material);
		mesh.rotation.y = Math.PI / 2;
		mesh.position.x = planeWidth / 2;
		mesh.name = "side";
		parent.add(mesh);

		// bottom
		var geom = new THREE.PlaneBufferGeometry(planeWidth, planeHeight, 1, 1);
		mesh = new THREE.Mesh(geom, material);
		mesh.rotation.x = Math.PI;
		mesh.position.z = z0;
		mesh.name = "bottom";
		parent.add(mesh);

		parent.updateMatrixWorld();
	}

	addEdges(layer, parent, material, z0) {

		var i, x, y,
			grid = this.data.grid,
			grid_values = grid.array,
			w = grid.width,
			h = grid.height,
			k = w * (h - 1),
			planeWidth = this.data.width,
			planeHeight = this.data.height,
			hpw = planeWidth / 2,
			hph = planeHeight / 2,
			psw = planeWidth / (w - 1),
			psh = planeHeight / (h - 1);

		var vl = [];

		// terrain edges
		var vl_fr = [],
			vl_bk = [],
			vl_le = [],
			vl_ri = [];

		for (i = 0; i < w; i++) {
			x = -hpw + psw * i;
			vl_fr.push(x, -hph, grid_values[k + i]);
			vl_bk.push(x, hph, grid_values[i]);
		}

		for (i = 0; i < h; i++) {
			y = hph - psh * i;
			vl_le.push(-hpw, y, grid_values[w * i]);
			vl_ri.push(hpw, y, grid_values[w * (i + 1) - 1]);
		}

		vl.push(vl_fr, vl_bk, vl_le, vl_ri);

		if (z0 !== undefined) {
			// horizontal rectangle at bottom
			vl.push([-hpw, -hph, z0,
						hpw, -hph, z0,
						hpw,  hph, z0,
					-hpw,  hph, z0,
					-hpw, -hph, z0]);

			// vertical lines at corners
			[[-hpw, -hph, grid_values[grid_values.length - w]],
				[ hpw, -hph, grid_values[grid_values.length - 1]],
				[ hpw,  hph, grid_values[w - 1]],
				[-hpw,  hph, grid_values[0]]].forEach(function (v) {

				vl.push([v[0], v[1], v[2], v[0], v[1], z0]);

			});
		}

		vl.forEach(function (v) {

			var geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
			var obj = new THREE.Line(geom, material);
			obj.name = "frame";
			parent.add(obj);

		});

		parent.updateMatrixWorld();
	}

	// add quad wireframe
	addWireframe(layer, parent, material) {

		var grid = this.data.grid,
			grid_values = grid.array,
			w = grid.width,
			h = grid.height,
			planeWidth = this.data.width,
			planeHeight = this.data.height,
			hpw = planeWidth / 2,
			hph = planeHeight / 2,
			psw = planeWidth / (w - 1),
			psh = planeHeight / (h - 1);

		var v, geom, x, y, vx, vy, group = new THREE.Group();

		for (x = w - 1; x >= 0; x--) {
			v = [];
			vx = -hpw + psw * x;

			for (y = h - 1; y >= 0; y--) {
				v.push(vx, hph - psh * y, grid_values[x + w * y]);
			}

			geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(v, 3));

			group.add(new THREE.Line(geom, material));
		}

		for (y = h - 1; y >= 0; y--) {
			v = [];
			vy = hph - psh * y;

			for (x = w - 1; x >= 0; x--) {
				v.push(-hpw + psw * x, vy, grid_values[x + w * y]);
			}

			geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(v, 3));

			group.add(new THREE.Line(geom, material));
		}

		parent.add(group);
		parent.updateMatrixWorld();
	}

	getValue(x, y) {
		var grid = this.data.grid;
		if (0 <= x && x < grid.width && 0 <= y && y < grid.height) return grid.array[x + grid.width * y];
		return null;
	}

	contains(x, y) {
		var translate = this.data.translate,
			xmin = translate[0] - this.data.width / 2,
			xmax = translate[0] + this.data.width / 2,
			ymin = translate[1] - this.data.height / 2,
			ymax = translate[1] + this.data.height / 2;
		if (xmin <= x && x <= xmax && ymin <= y && y <= ymax) return true;
		return false;
	}
}


class Q3DClippedDEMBlock extends Q3DDEMBlockBase {

	loadJSONObject(obj, layer, callback) {
		super.loadJSONObject(obj, layer, callback);

		if (obj.geom === undefined) return;

		var geom = new THREE.BufferGeometry(),
			mesh = new THREE.Mesh(geom, (this.materials[this.currentMtlIndex] || {}).mtl);
		mesh.position.fromArray(obj.translate);
		mesh.scale.z = obj.zScale;
		layer.addObject(mesh);

		var _this = this;
		var buildGeometry = function (obj) {

			var v = obj.triangles.v,
				origin = layer.sceneData.origin,
				be = layer.sceneData.baseExtent,
				base_width = be.width,
				base_height = be.height,
				x0 = be.cx - origin.x - base_width * 0.5,
				y0 = be.cy - origin.y - base_height * 0.5;

			var normals = [], uvs = [];
			for (var i = 0, l = v.length; i < l; i += 3) {
				normals.push(0, 0, 1);
				uvs.push((v[i] - x0) / base_width, (v[i + 1] - y0) / base_height);
			}

			geom.setIndex(obj.triangles.f);
			geom.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
			geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
			geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
			geom.computeVertexNormals();

			geom.attributes.position.needsUpdate = true;
			geom.attributes.normal.needsUpdate = true;
			geom.attributes.uv.needsUpdate = true;

			_this.data.polygons = obj.polygons;
			if (callback) callback(mesh);
		};

		if (obj.geom.url !== undefined) {
			Q3D.application.loadFile(obj.geom.url, "json", function (obj) {
				buildGeometry(obj);
			});
		}
		else {    // local mode or WebKit Bridge
			buildGeometry(obj.geom);
		}

		this.obj = mesh;
		return mesh;
	}

	buildSides(layer, parent, material, z0) {
		var polygons = this.data.polygons,
			bzFunc = function (x, y) { return z0; };

		// make back-side material for bottom
		var mat_back = material.clone();
		mat_back.side = THREE.BackSide;
		layer.materials.add(mat_back);

		var geom, mesh, shape;
		for (var i = 0, l = polygons.length; i < l; i++) {
			var bnds = polygons[i];

			// sides
			for (var j = 0, m = bnds.length; j < m; j++) {
				geom = Q3D.Utils.createWallGeometry(bnds[j], bzFunc, true);
				mesh = new THREE.Mesh(geom, material);
				mesh.name = "side";
				parent.add(mesh);
			}

			// bottom
			shape = new THREE.Shape(Q3D.Utils.flatArrayToVec2Array(bnds[0], 3));
			for (j = 1, m = bnds.length; j < m; j++) {
				shape.holes.push(new THREE.Path(Q3D.Utils.flatArrayToVec2Array(bnds[j], 3)));
			}
			geom = new THREE.ShapeBufferGeometry(shape);
			mesh = new THREE.Mesh(geom, mat_back);
			mesh.position.z = z0;
			mesh.name = "bottom";
			parent.add(mesh);
		}
		parent.updateMatrixWorld();
	}

	// not implemented
	getValue(x, y) {
		return null;
	}

	// not implemented
	contains(x, y) {
		return false;
	}

}


class Q3DMapLayer extends THREE.EventDispatcher {

	constructor() {
		super();

		this.properties = {};

		this.materials = new Q3DMaterials();
		this.materials.addEventListener("renderRequest", this.requestRender.bind(this));

		this.objectGroup = new Q3DGroup();
		this.objectGroup.name = "layer";
		this.objects = [];
	}

	addObject(object) {
		object.userData.layerId = this.id;
		this.objectGroup.add(object);

		var o = this.objects;
		object.traverse(function (obj) {
			o.push(obj);
		});
		return this.objectGroup.children.length - 1;
	}

	addObjects(objects) {
		for (var i = 0; i < objects.length; i++) {
			this.addObject(objects[i]);
		}
	}

	clearObjects() {
		// dispose of geometries
		this.objectGroup.traverse(function (obj) {
			if (obj.geometry) obj.geometry.dispose();
		});

		// dispose of materials
		this.materials.dispose();

		// remove all child objects from object group
		for (var i = this.objectGroup.children.length - 1; i >= 0; i--) {
			this.objectGroup.remove(this.objectGroup.children[i]);
		}
		this.objects = [];
	}

	visibleObjects() {
		return (this.visible) ? this.objects : [];
	}

	loadJSONObject(jsonObject, scene) {
		if (jsonObject.type == "layer") {
			// properties
			if (jsonObject.properties !== undefined) {
				this.properties = jsonObject.properties;
				this.visible = (jsonObject.properties.visible || Q3D.Config.allVisible) ? true : false;
			}

			if (jsonObject.data !== undefined) {
				this.clearObjects();

				// materials
				if (jsonObject.data.materials !== undefined) {
					this.materials.loadJSONObject(jsonObject.data.materials);
				}
			}

			this.sceneData = scene.userData;
		}
	}

	get clickable() {
		return this.properties.clickable;
	}

	get opacity() {
		return this.materials.opacity();
	}

	set opacity(value) {
		this.materials.setOpacity(value);

		if (this.labelGroup) {
			this.labelGroup.traverse(function (obj) {
				if (obj.material) obj.material.opacity = value;
			});
		}

		if (this.labelConnectorGroup && this.labelConnectorGroup.children.length) {
			this.labelConnectorGroup.children[0].material.opacity = value;
		}

		this.requestRender();
	}

	get visible() {
		return this.objectGroup.visible;
	}

	set visible(value) {
		this.objectGroup.visible = value;
		this.requestRender();
	}

	boundingBox() {
		return new THREE.Box3().setFromObject(this.objectGroup);
	}

	setWireframeMode(wireframe) {
		this.materials.setWireframeMode(wireframe);
	}

	requestRender() {
		this.dispatchEvent({type: "renderRequest"});
	}

}


class Q3DDEMLayer extends Q3DMapLayer {

	constructor() {
		super();
		this.type = Q3D.LayerType.DEM;
		this.blocks = [];
	}

	loadJSONObject(jsonObject, scene) {
		var old_blockIsClipped = this.properties.clipped;

		super.loadJSONObject(jsonObject, scene);
		if (jsonObject.type == "layer") {
			if (old_blockIsClipped !== jsonObject.properties.clipped) {
				// DEM type changed
				this.blocks = [];
			}

			var p = scene.userData,
				rotation = p.baseExtent.rotation;

			if (jsonObject.properties.clipped) {
				this.objectGroup.position.set(0, 0, 0);
				this.objectGroup.rotation.z = 0;

				if (rotation) {
					// rotate around center of base extent
					this.objectGroup.position.copy(p.pivot).negate();
					this.objectGroup.position.applyAxisAngle(Q3D.uv.k, rotation * Q3D.deg2rad);
					this.objectGroup.position.add(p.pivot);
					this.objectGroup.rotateOnAxis(Q3D.uv.k, rotation * Q3D.deg2rad);
				}
			}
			else {
				this.objectGroup.position.copy(p.pivot);
				this.objectGroup.position.z *= p.zScale;
				this.objectGroup.rotation.z = rotation * Q3D.deg2rad;
			}
			this.objectGroup.updateMatrixWorld();

			if (jsonObject.data !== undefined) {
				jsonObject.data.forEach(function (obj) {
					this.buildBlock(obj, scene, this);
				}, this);
			}
		}
		else if (jsonObject.type == "block") {
			this.buildBlock(jsonObject, scene, this);
		}
	}

	buildBlock(jsonObject, scene, layer) {
		var _this = this,
			block = this.blocks[jsonObject.block];

		if (block === undefined) {
			block = (layer.properties.clipped) ? (new Q3DClippedDEMBlock()) : (new Q3DDEMBlock());
			this.blocks[jsonObject.block] = block;
		}

		block.loadJSONObject(jsonObject, this, function (mesh) {

			var material;
			if (jsonObject.wireframe) {
				material = new Q3DMaterial();
				material.loadJSONObject(jsonObject.wireframe.mtl);
				_this.materials.add(material);

				block.addWireframe(_this, mesh, material.mtl);

				var mtl = block.material.mtl;
				mtl.polygonOffset = true;
				mtl.polygonOffsetFactor = 1;
				mtl.polygonOffsetUnits = 1;
			}

			if (jsonObject.sides) {
				// sides and bottom
				material = new Q3DMaterial();
				material.loadJSONObject(jsonObject.sides.mtl);
				_this.materials.add(material);

				block.buildSides(_this, mesh, material.mtl, jsonObject.sides.bottom);
				_this.sideVisible = true;
			}

			if (jsonObject.edges) {
				material = new Q3DMaterial();
				material.loadJSONObject(jsonObject.edges.mtl);
				_this.materials.add(material);

				block.addEdges(_this, mesh, material.mtl, (jsonObject.sides) ? jsonObject.sides.bottom : undefined);
			}

			_this.requestRender();
		});
	}

	// calculate elevation at the coordinates (x, y) on triangle face
	getZ(x, y) {
		for (var i = 0, l = this.blocks.length; i < l; i++) {
			var block = this.blocks[i],
				data = block.data;

			if (!block.contains(x, y)) continue;

			var ix = data.width / (data.grid.width - 1),
				iy = data.height / (data.grid.height - 1);

			var xmin = data.translate[0] - data.width / 2,
				ymax = data.translate[1] + data.height / 2;

			var mx0 = Math.floor((x - xmin) / ix),
				my0 = Math.floor((ymax - y) / iy);

			var z = [block.getValue(mx0, my0),
						block.getValue(mx0 + 1, my0),
						block.getValue(mx0, my0 + 1),
						block.getValue(mx0 + 1, my0 + 1)];

			var px0 = xmin + ix * mx0,
				py0 = ymax - iy * my0;

			var sdx = (x - px0) / ix,
				sdy = (py0 - y) / iy;

			if (sdx <= 1 - sdy) return z[0] + (z[1] - z[0]) * sdx + (z[2] - z[0]) * sdy;
			else return z[3] + (z[2] - z[3]) * (1 - sdx) + (z[1] - z[3]) * (1 - sdy);
		}
		return null;
	}

	segmentizeLineString(lineString, zFunc) {
		// does not support multiple blocks
		if (zFunc === undefined) zFunc = function () { return 0; };
		var width = this.sceneData.width,
			height = this.sceneData.height;
		var xmin = -width / 2,
			ymax = height / 2;
		var grid = this.blocks[0].data.grid,
			ix = width / (grid.width - 1),
			iy = height / (grid.height - 1);
		var sort_func = function (a, b) { return a - b; };

		var pts = [];
		for (var i = 1, l = lineString.length; i < l; i++) {
			var pt1 = lineString[i - 1], pt2 = lineString[i];
			var x1 = pt1[0], x2 = pt2[0], y1 = pt1[1], y2 = pt2[1], z1 = pt1[2], z2 = pt2[2];
			var nx1 = (x1 - xmin) / ix,
				nx2 = (x2 - xmin) / ix;
			var ny1 = (ymax - y1) / iy,
				ny2 = (ymax - y2) / iy;
			var ns1 = Math.abs(ny1 + nx1),
				ns2 = Math.abs(ny2 + nx2);

			var p = [0], nvp = [[nx1, nx2], [ny1, ny2], [ns1, ns2]];
			for (var j = 0; j < 3; j++) {
				var v1 = nvp[j][0], v2 = nvp[j][1];
				if (v1 == v2) continue;
				var k = Math.ceil(Math.min(v1, v2));
				var n = Math.floor(Math.max(v1, v2));
				for (; k <= n; k++) {
					p.push((k - v1) / (v2 - v1));
				}
			}

			p.sort(sort_func);

			var x, y, z, lp = null;
			for (var j = 0, m = p.length; j < m; j++) {
				if (lp === p[j]) continue;
				if (p[j] == 1) break;

				x = x1 + (x2 - x1) * p[j];
				y = y1 + (y2 - y1) * p[j];

				if (z1 === undefined || z2 === undefined) z = zFunc(x, y);
				else z = z1 + (z2 - z1) * p[j];

				pts.push(new THREE.Vector3(x, y, z));

				// Q3D.Utils.putStick(x, y, zFunc);

				lp = p[j];
			}
		}
		// last point (= the first point)
		var pt = lineString[lineString.length - 1];
		pts.push(new THREE.Vector3(pt[0], pt[1], (pt[2] === undefined) ? zFunc(pt[0], pt[1]) : pt[2]));

		/*
		for (var i = 0, l = lineString.length - 1; i < l; i++) {
			Q3D.Utils.putStick(lineString[i][0], lineString[i][1], zFunc, 0.8);
		}
		*/
		return pts;
	}

	setCurrentMaterial(mtlIndex) {

		this.materials.removeGroupItems(this.currentMtlIndex);

		this.currentMtlIndex = mtlIndex;

		var b, m;
		for (var i = 0, l = this.blocks.length; i < l; i++) {
			b = this.blocks[i];
			m = b.materials[mtlIndex];
			if (m !== undefined) {
				b.obj.material = m.mtl;
				this.materials.add(m);
			}
		}
		this.requestRender();
	}

	setSideVisible(visible) {
		this.sideVisible = visible;
		this.objectGroup.traverse(function (obj) {
			if (obj.name == "side" || obj.name == "bottom") obj.visible = visible;
		});
	}

	// texture animation
	prepareTexAnimation(from, to) {

		function imageData2Canvas(img) {
			var cnvs = document.createElement("canvas");
			cnvs.width = img.width;
			cnvs.height = img.height;

			var ctx = cnvs.getContext("2d");
			ctx.putImageData(img, 0, 0);
			return cnvs;
		}

		this.anim = [];

		var m, canvas, ctx, opt, mtl;
		var img_from, img_to;
		for (var i = 0; i < this.blocks.length; i++) {

			m = this.blocks[i].obj.material;

			img_from = this.blocks[i].materials[from].mtl.map.image;
			img_to = this.blocks[i].materials[to].mtl.map.image;

			canvas = document.createElement("canvas");
			canvas.width = (img_from.width > img_to.width) ? img_from.width : img_to.width;
			canvas.height = (img_from.width > img_to.width) ? img_from.height : img_to.height;

			ctx = canvas.getContext("2d");

			opt = {};
			opt.map = new THREE.CanvasTexture(canvas);
			opt.map.anisotropy = Q3D.Config.texture.anisotropy;
			opt.transparent = true;

			mtl = undefined;
			if (m) {
				if (m.isMeshToonMaterial) {
					mtl = new THREE.MeshToonMaterial(opt);
				}
				else if (m.isMeshPhongMaterial) {
					mtl = new THREE.MeshPhongMaterial(opt);
				}
			}
			if (mtl === undefined) {
				mtl = new THREE.MeshLambertMaterial(opt);
			}

			if (img_from instanceof ImageData) {    // WebKit Bridge
				img_from = imageData2Canvas(img_from);
				img_to = imageData2Canvas(img_to);
			}

			this.blocks[i].obj.material = mtl;

			this.materials.add(mtl);

			this.anim.push({
				img_from: img_from,
				img_to: img_to,
				ctx: ctx,
				tex: mtl.map
			});
		}
	}

	setTextureAt(progress, effect) {

		if (this.anim === undefined) return;

		var a, w, h, w0, h0, w1, h1, ew, ew1;
		for (var i = 0; i < this.anim.length; i++) {
			a = this.anim[i];
			w = a.ctx.canvas.width;
			h = a.ctx.canvas.height;
			w0 = a.img_from.width;
			h0 = a.img_from.height;
			w1 = a.img_to.width;
			h1 = a.img_to.height;

			if (effect == 0) {  // fade in
				a.ctx.globalAlpha = 1;
				a.ctx.drawImage(a.img_from, 0, 0, w0, h0,
											0, 0, w, h);
				a.ctx.globalAlpha = progress;
				a.ctx.drawImage(a.img_to, 0, 0, w1, h1,
											0, 0, w, h);
			}
			else if (effect == 2) {  // slide to left (not used)
				if (progress === null) {
					a.ctx.drawImage(a.img_from, 0, 0, w0, h0,
												0, 0, w, h);
				}
				else {
					ew1 = w1 * progress;
					ew = w * progress;
					a.ctx.drawImage(a.img_to, w1 - ew1, 0, ew1, h1,
											w - ew, 0, ew, h);
				}
			}
			a.tex.needsUpdate = true;
		}
	}
}


class Q3DVectorLayer extends Q3DMapLayer {

	constructor() {
		super();
		this.features = [];
		this.labels = [];
	}

	// build(features, startIndex) {}

	addFeature(featureIdx, f, objs) {
		super.addObjects(objs);

		for (var i = 0; i < objs.length; i++) {
			objs[i].userData.featureIdx = featureIdx;
		}
		f.objs = objs;

		this.features[featureIdx] = f;
		return f;
	}

	clearLabels() {
		this.labels = [];
		if (this.labelGroup) this.labelGroup.clear();
		if (this.labelConnectorGroup) this.labelConnectorGroup.clear();
	}

	buildLabels(features, getPointsFunc) {
		if (this.properties.label === undefined || getPointsFunc === undefined) return;

		var _this = this,
			p = this.properties,
			label = p.label,
			bs = this.sceneData.baseExtent.width * 0.016,
			sc = bs * Math.pow(1.2, label.size);

		var hasOtl = (label.olcolor !== undefined),
			hasConn = (label.cncolor !== undefined);

		if (hasConn) {
			var line_mtl = new THREE.LineBasicMaterial({
				color: label.cncolor,
				opacity: this.materials.opacity(),
				transparent: true
			});
		}

		var hasUnderline = Boolean(hasConn && label.underline);
		if (hasUnderline) {
			var ul_geom = new THREE.BufferGeometry();
			ul_geom.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));

			var onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
				this.quaternion.copy(camera.quaternion);
				this.updateMatrixWorld();
			};
		}

		var canvas = document.createElement("canvas"),
			ctx = canvas.getContext("2d");

		var font, tw, th, cw, ch;
		th = ch = Q3D.Config.label.canvasHeight;
		font = th + "px " + (label.font || "sans-serif");

		canvas.height = ch;

		var f, text, partIdx, vec, sprite, mtl, geom, conn, x, y, j, sc, opacity;
		var underline;

		for (var i = 0, l = features.length; i < l; i++) {
			f = features[i];
			text = f.lbl;
			if (!text) continue;

			opacity = this.materials.mtl(f.mtl).opacity;

			partIdx = 0;
			getPointsFunc(f).forEach(function (pt) {

				// label position
				vec = new THREE.Vector3(pt[0], pt[1], (label.relative) ? pt[2] + f.lh : f.lh);

				// render label text
				ctx.font = font;
				tw = ctx.measureText(text).width + 2;
				cw = THREE.Math.ceilPowerOfTwo(tw);
				x = cw / 2;
				y = ch / 2;

				canvas.width = cw;
				ctx.clearRect(0, 0, cw, ch);

				if (label.bgcolor !== undefined) {
					ctx.fillStyle = label.bgcolor;
					ctx.roundRect((cw - tw) / 2, (ch - th) / 2, tw, th, 4).fill();    // definition is in this file
				}

				ctx.font = font;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";

				if (hasOtl) {
					// outline effect
					ctx.fillStyle = label.olcolor;
					for (j = 0; j < 9; j++) {
						if (j != 4) ctx.fillText(text, x + Math.floor(j / 3) - 1, y + j % 3 - 1);
					}
				}

				ctx.fillStyle = label.color;
				ctx.fillText(text, x, y);

				mtl = new THREE.SpriteMaterial({
					map: new THREE.TextureLoader().load(canvas.toDataURL(), function () { _this.requestRender(); }),
					opacity: opacity,
					transparent: true
				});

				sprite = new THREE.Sprite(mtl);
				if (hasUnderline) {
					sprite.center.set((1 - tw / cw) * 0.5, 0);
				}
				else {
					sprite.center.set(0.5, 0);
				}
				sprite.position.copy(vec);
				sprite.scale.set(sc * cw / ch, sc, 1);

				sprite.userData.layerId = this.id;
				sprite.userData.properties = f.prop;
				sprite.userData.objs = f.objs;
				sprite.userData.partIdx = partIdx;
				sprite.userData.isLabel = true;

				this.labelGroup.add(sprite);

				if (Q3D.Config.label.clickable) this.labels.push(sprite);

				if (hasConn) {
					// a connector
					geom = new THREE.BufferGeometry();
					geom.setAttribute("position", new THREE.Float32BufferAttribute(vec.toArray().concat(pt), 3));

					conn = new THREE.Line(geom, line_mtl);
					conn.userData = sprite.userData;

					this.labelConnectorGroup.add(conn);

					if (hasUnderline) {
						underline = new THREE.Line(ul_geom, line_mtl);
						underline.position.copy(vec);
						underline.scale.x = sc * tw / th;
						underline.updateMatrixWorld();
						underline.onBeforeRender = onBeforeRender;
						conn.add(underline);
					}
				}
				partIdx++;
			}, this);
		}
	}

	loadJSONObject(jsonObject, scene) {
		super.loadJSONObject(jsonObject, scene);
		if (jsonObject.type == "layer") {
			if (jsonObject.data !== undefined) {
				this.features = [];
				this.clearLabels();

				// build labels
				if (this.properties.label !== undefined) {
					// create a label group and a label connector group
					if (this.labelGroup === undefined) {
						this.labelGroup = new Q3DGroup();
						this.labelGroup.userData.layerId = this.id;
						this.labelGroup.visible = this.visible;
						scene.labelGroup.add(this.labelGroup);
					}

					if (this.labelConnectorGroup === undefined) {
						this.labelConnectorGroup = new Q3DGroup();
						this.labelConnectorGroup.userData.layerId = this.id;
						this.labelConnectorGroup.visible = this.visible;
						scene.labelConnectorGroup.add(this.labelConnectorGroup);
					}
				}

				(jsonObject.data.blocks || []).forEach(function (block) {
					if (block.url !== undefined) Q3D.application.loadJSONFile(block.url);
					else {
						this.build(block.features, block.startIndex);
						if (this.properties.label !== undefined) this.buildLabels(block.features);
					}
				}, this);
			}
		}
		else if (jsonObject.type == "block") {
			this.build(jsonObject.features, jsonObject.startIndex);
			if (this.properties.label !== undefined) this.buildLabels(jsonObject.features);
		}
	}

	get visible() {
		return this.objectGroup.visible;
		// return super.visible;
	}

	set visible(value) {
		if (this.labelGroup) this.labelGroup.visible = value;
		if (this.labelConnectorGroup) this.labelConnectorGroup.visible = value;

		this.objectGroup.visible = value;
		this.requestRender();
		// super.visible = value;
	}

}


class Q3DPointLayer extends Q3DVectorLayer {

	constructor() {
		super();
		this.type = Q3D.LayerType.Point;
	}

	loadJSONObject(jsonObject, scene) {
		if (jsonObject.type == "layer" && jsonObject.properties.objType == "3D Model" && jsonObject.data !== undefined) {
			if (this.models === undefined) {
				var _this = this;

				this.models = new Q3DModels();
				this.models.addEventListener("modelLoaded", function (event) {
					_this.materials.addFromObject3D(event.model.scene);
					_this.requestRender();
				});
			}
			else {
				this.models.clear();
			}
			this.models.loadJSONObject(jsonObject.data.models);
		}

		super.loadJSONObject(jsonObject, scene);
	}

	build(features, startIndex) {
		var objType = this.properties.objType;
		if (objType == "Point") {
			return this.buildPoints(features, startIndex);
		}
		else if (objType == "Billboard") {
			return this.buildBillboards(features, startIndex);
		}
		else if (objType == "3D Model") {
			return this.buildModels(features, startIndex);
		}

		var unitGeom, transform;
		if (this.cachedGeometryType === objType) {
			unitGeom = this.geometryCache;
			transform = this.transformCache;
		}
		else {
			var gt = this.geomAndTransformFunc(objType);
			unitGeom = gt[0];
			transform = gt[1];
		}

		var f, mtl, pts, i, l, mesh, meshes;
		for (var fidx = 0; fidx < features.length; fidx++) {
			f = features[fidx];
			pts = f.geom.pts;
			mtl = this.materials.mtl(f.mtl);

			meshes = [];
			for (i = 0, l = pts.length; i < l; i++) {
				mesh = new THREE.Mesh(unitGeom, mtl);
				transform(mesh, f.geom, pts[i]);

				mesh.userData.properties = f.prop;

				meshes.push(mesh);
			}
			this.addFeature(fidx + startIndex, f, meshes);
		}

		this.cachedGeometryType = objType;
		this.geometryCache = unitGeom;
		this.transformCache = transform;
	}

	geomAndTransformFunc(objType) {

		var deg2rad = Q3D.deg2rad,
			rx = 90 * deg2rad;

		if (objType == "Sphere") {
			return [
				new THREE.SphereBufferGeometry(1, 32, 32),
				function (mesh, geom, pt) {
					mesh.scale.setScalar(geom.r);
					mesh.position.fromArray(pt);
				}
			];
		}
		else if (objType == "Box") {
			return [
				new THREE.BoxBufferGeometry(1, 1, 1),
				function (mesh, geom, pt) {
					mesh.scale.set(geom.w, geom.h, geom.d);
					mesh.rotation.x = rx;
					mesh.position.set(pt[0], pt[1], pt[2] + geom.h / 2);
				}
			];
		}
		else if (objType == "Disk") {
			var sz = this.sceneData.zScale;
			return [
				new THREE.CircleBufferGeometry(1, 32),
				function (mesh, geom, pt) {
					mesh.scale.set(geom.r, geom.r * sz, 1);
					mesh.rotateOnWorldAxis(Q3D.uv.i, -geom.d * deg2rad);
					mesh.rotateOnWorldAxis(Q3D.uv.k, -geom.dd * deg2rad);
					mesh.position.fromArray(pt);
				}
			];
		}
		else if (objType == "Plane") {
			var sz = this.sceneData.zScale;
			return [
				new THREE.PlaneBufferGeometry(1, 1, 1, 1),
				function (mesh, geom, pt) {
					mesh.scale.set(geom.w, geom.l * sz, 1);
					mesh.rotateOnWorldAxis(Q3D.uv.i, -geom.d * deg2rad);
					mesh.rotateOnWorldAxis(Q3D.uv.k, -geom.dd * deg2rad);
					mesh.position.fromArray(pt);
				}
			];
		}

		// Cylinder or Cone
		var radiusTop = (objType == "Cylinder") ? 1 : 0;
		return [
			new THREE.CylinderBufferGeometry(radiusTop, 1, 1, 32),
			function (mesh, geom, pt) {
				mesh.scale.set(geom.r, geom.h, geom.r);
				mesh.rotation.x = rx;
				mesh.position.set(pt[0], pt[1], pt[2] + geom.h / 2);
			}
		];
	}

	buildPoints(features, startIndex) {
		var f, geom, mtl, obj;
		for (var fidx = 0; fidx < features.length; fidx++) {
			f = features[fidx];

			geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(f.geom.pts, 3));
			mtl = this.materials.mtl(f.mtl);

			obj = new THREE.Points(geom, mtl);
			obj.userData.properties = f.prop;

			this.addFeature(fidx + startIndex, f, [obj]);
		}
	}

	buildBillboards(features, startIndex) {

		features.forEach(function (f, fidx) {

			var material = this.materials.get(f.mtl);

			var sprite, sprites = [];
			for (var i = 0; i < f.geom.pts.length; i++) {
				sprite = new THREE.Sprite(material.mtl);
				sprite.position.fromArray(f.geom.pts[i]);
				sprite.userData.properties = f.prop;

				sprites.push(sprite);
			}

			material.callbackOnLoad(function () {
				var img = material.mtl.map.image;
				for (var i = 0; i < sprites.length; i++) {
					sprites[i].scale.set(f.geom.size,
										f.geom.size * img.height / img.width,
										1);
					sprites[i].updateMatrixWorld();
				}
			});

			this.addFeature(fidx + startIndex, f, sprites);
		}, this);
	}

	buildModels(features, startIndex) {
		var q = new THREE.Quaternion(),
			e = new THREE.Euler(),
			deg2rad = Q3D.deg2rad;

		features.forEach(function (f, fidx) {

			var model = this.models.get(f.model);
			if (!model) {
				console.log("3D Model: There is a missing model.");
				return;
			}

			var parents = [];
			var pt, pts = f.geom.pts;
			for (var i = 0; i < pts.length; i++) {
				pt = pts[i];

				var parent = new Q3DGroup();
				parent.position.fromArray(pt);
				parent.scale.set(1, 1, this.sceneData.zScale);

				parent.userData.properties = f.prop;

				parents.push(parent);
			}

			model.callbackOnLoad(function (m) {
				var parent, obj;
				for (var i = 0; i < parents.length; i++) {
					parent = parents[i];

					obj = m.scene.clone();
					obj.scale.setScalar(f.geom.scale);

					if (obj.rotation.x) {
						// reset coordinate system to z-up and specified rotation
						obj.rotation.set(0, 0, 0);
						obj.quaternion.multiply(q.setFromEuler(e.set(f.geom.rotateX * deg2rad,
																		f.geom.rotateY * deg2rad,
																		f.geom.rotateZ * deg2rad,
																		f.geom.rotateO || "XYZ")));
					}
					else {
						// y-up to z-up and specified rotation
						obj.quaternion.multiply(q.setFromEuler(e.set(f.geom.rotateX * deg2rad,
																		f.geom.rotateY * deg2rad,
																		f.geom.rotateZ * deg2rad,
																		f.geom.rotateO || "XYZ")));
						obj.quaternion.multiply(q.setFromEuler(e.set(Math.PI / 2, 0, 0)));
					}
					parent.add(obj);
				}
			});

			this.addFeature(fidx + startIndex, f, parents);
		}, this);
	}

	buildLabels(features) {
		super.buildLabels(features, function (f) { return f.geom.pts; });
	}

}


class Q3DLineLayer extends Q3DVectorLayer {

	constructor() {
		super();
		this.type = Q3D.LayerType.Line;
	}

	clearObjects() {
		super.clearObjects();

		if (this.origMtls) {
			this.origMtls.dispose();
			this.origMtls = undefined;
		}
	}

	build(features, startIndex) {

		if (this._lastObjType !== this.properties.objType) this._createObject = null;

		var createObject = this._createObject || this.createObjFunc(this.properties.objType);

		var f, i, lines, obj, objs;
		for (var fidx = 0; fidx < features.length; fidx++) {
			f = features[fidx];
			lines = f.geom.lines;

			objs = [];
			for (i = 0; i < lines.length; i++) {
				obj = createObject(f, lines[i]);
				obj.userData.properties = f.prop;
				obj.userData.mtl = f.mtl;

				objs.push(obj);
			}
			this.addFeature(fidx + startIndex, f, objs);
		}

		this._lastObjType = this.properties.objType;
		this._createObject = createObject;
	}

	createObjFunc(objType) {
		var materials = this.materials;

		if (objType == "Line") {
			return function (f, vertices) {
				var geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

				var obj = new THREE.Line(geom, materials.mtl(f.mtl));
				if (obj.material instanceof THREE.LineDashedMaterial) obj.computeLineDistances();
				return obj;
			};
		}
		else if (objType == "Thick Line") {
			return function (f, vertices) {
				var line = new MeshLine();
				line.setPoints(vertices);

				return new THREE.Mesh(line, materials.mtl(f.mtl));
			};
		}
		else if (objType == "Pipe" || objType == "Cone") {
			var jointGeom, cylinGeom;
			if (objType == "Pipe") {
				jointGeom = new THREE.SphereBufferGeometry(1, 32, 32);
				cylinGeom = new THREE.CylinderBufferGeometry(1, 1, 1, 32);
			}
			else {
				cylinGeom = new THREE.CylinderBufferGeometry(0, 1, 1, 32);
			}

			var group, mesh, axis = Q3D.uv.j;
			var pt0 = new THREE.Vector3(), pt1 = new THREE.Vector3(), sub = new THREE.Vector3();

			return function (f, points) {
				group = new Q3DGroup();

				pt0.fromArray(points[0]);
				for (var i = 1, l = points.length; i < l; i++) {
					pt1.fromArray(points[i]);

					mesh = new THREE.Mesh(cylinGeom, materials.mtl(f.mtl));
					mesh.scale.set(f.geom.r, pt0.distanceTo(pt1), f.geom.r);
					mesh.position.set((pt0.x + pt1.x) / 2, (pt0.y + pt1.y) / 2, (pt0.z + pt1.z) / 2);
					mesh.quaternion.setFromUnitVectors(axis, sub.subVectors(pt1, pt0).normalize());
					group.add(mesh);

					if (jointGeom && i < l - 1) {
						mesh = new THREE.Mesh(jointGeom, materials.mtl(f.mtl));
						mesh.scale.setScalar(f.geom.r);
						mesh.position.copy(pt1);
						group.add(mesh);
					}

					pt0.copy(pt1);
				}
				return group;
			};
		}
		else if (objType == "Box") {
			// In this method, box corners are exposed near joint when both azimuth and slope of
			// the segments of both sides are different. Also, some unnecessary faces are created.
			var faces = [], vi;
			vi = [[0, 5, 4], [4, 5, 1],   // left turn - top, side, bottom
				[3, 0, 7], [7, 0, 4],
				[6, 3, 2], [2, 3, 7],
				[4, 1, 0], [0, 1, 5],   // right turn - top, side, bottom
				[1, 2, 5], [5, 2, 6],
				[2, 7, 6], [6, 7, 3]];

			for (var j = 0; j < 12; j++) {
				faces.push(new THREE.Face3(vi[j][0], vi[j][1], vi[j][2]));
			}

			return function (f, points) {
				var geometry = new THREE.Geometry();

				var geom, dist, rx, rz, wh4, vb4, vf4;
				var pt0 = new THREE.Vector3(), pt1 = new THREE.Vector3(), sub = new THREE.Vector3(),
					pt = new THREE.Vector3(), ptM = new THREE.Vector3(), scale1 = new THREE.Vector3(1, 1, 1),
					matrix = new THREE.Matrix4(), quat = new THREE.Quaternion();

				pt0.fromArray(points[0]);
				for (var i = 1, l = points.length; i < l; i++) {
					pt1.fromArray(points[i]);
					dist = pt0.distanceTo(pt1);
					sub.subVectors(pt1, pt0);
					rx = Math.atan2(sub.z, Math.sqrt(sub.x * sub.x + sub.y * sub.y));
					rz = Math.atan2(sub.y, sub.x) - Math.PI / 2;
					ptM.set((pt0.x + pt1.x) / 2, (pt0.y + pt1.y) / 2, (pt0.z + pt1.z) / 2);   // midpoint
					quat.setFromEuler(new THREE.Euler(rx, 0, rz, "ZXY"));
					matrix.compose(ptM, quat, scale1);

					// place a box to the segment
					geom = new THREE.BoxGeometry(f.geom.w, dist, f.geom.h);
					geom.applyMatrix(matrix);
					geometry.merge(geom);

					// joint
					// 4 vertices of backward side of current segment
					wh4 = [[-f.geom.w / 2, f.geom.h / 2],
							[f.geom.w / 2, f.geom.h / 2],
							[f.geom.w / 2, -f.geom.h / 2],
							[-f.geom.w / 2, -f.geom.h / 2]];
					vb4 = [];
					for (j = 0; j < 4; j++) {
						pt.set(wh4[j][0], -dist / 2, wh4[j][1]);
						pt.applyMatrix4(matrix);
						vb4.push(pt.clone());
					}

					if (vf4) {
						geom = new THREE.Geometry();
						geom.vertices = vf4.concat(vb4);
						geom.faces = faces;
						geometry.merge(geom);
					}

					// 4 vertices of forward side
					vf4 = [];
					for (j = 0; j < 4; j++) {
						pt.set(wh4[j][0], dist / 2, wh4[j][1]);
						pt.applyMatrix4(matrix);
						vf4.push(new THREE.Vector3(pt.x, pt.y, pt.z));
					}

					pt0.copy(pt1);
				}

				geometry.faceVertexUvs = [[]];
				geometry.mergeVertices();
				geometry.computeFaceNormals();
				return new THREE.Mesh(geometry, materials.mtl(f.mtl));
			};
		}
		else if (objType == "Wall") {
			return function (f, vertices) {
				var bzFunc = function (x, y) { return f.geom.bh; };
				return new THREE.Mesh(Q3D.Utils.createWallGeometry(vertices, bzFunc),
									materials.mtl(f.mtl));
			};
		}
	}

	buildLabels(features) {
		// Line layer doesn't support label
		// super.buildLabels(features);
	}

	// prepare for growing line animation
	prepareAnimation(sequential) {

		if (this.origMtls !== undefined) return;

		function computeLineDistances(obj) {
			if (!obj.material.isLineDashedMaterial) return;

			obj.computeLineDistances();

			var dists = obj.geometry.attributes.lineDistance.array;
			obj.lineLength = dists[dists.length - 1];

			for (var i = 0; i < dists.length; i++) {
				dists[i] /= obj.lineLength;
			}
		}

		this.origMtls = new Q3DMaterials();
		this.origMtls.array = this.materials.array;

		this.materials.array = [];

		if (sequential) {
			var f, m, mtl, j;
			for (var i = 0; i < this.features.length; i++) {
				f = this.features[i];
				m = f.objs[0].material;

				if (m.isMeshLineMaterial) {
					mtl = new MeshLineMaterial();
					mtl.color = m.color;
					mtl.opacity = m.opacity;
					mtl.lineWidth = m.lineWidth;
					mtl.dashArray = 2;
					mtl.transparent = true;
				}
				else {
					if (m.isLineDashedMaterial) {
						mtl = m.clone();
					}
					else {
						mtl = new THREE.LineDashedMaterial({color: m.color, opacity: m.opacity});
					}
					mtl.gapSize = 1;
				}

				for (j = 0; j < f.objs.length; j++) {
					f.objs[j].material = mtl;
					computeLineDistances(f.objs[j]);
				}
				this.materials.add(mtl);
			}
		}
		else {
			var mtl, mtls = this.origMtls.array;

			for (var i = 0; i < mtls.length; i++) {
				mtl = mtls[i].mtl;

				if (mtl.isLineDashedMaterial) {
					mtl.gapSize = 1;
				}
				else if (mtl.isMeshLineMaterial) {
					mtl.dashArray = 2;
					mtl.transparent = true;
				}
				else if (mtl.isLineBasicMaterial) {
					mtl = new THREE.LineDashedMaterial({color: mtl.color, opacity: mtl.opacity});
				}

				this.materials.add(mtl);
			}

			var _this = this;
			this.objectGroup.traverse(function (obj) {

				if (obj.userData.mtl !== undefined) {
					obj.material = _this.materials.mtl(obj.userData.mtl);
					computeLineDistances(obj);
				}

			});
		}
	}

	// length: number [0 - 1]
	setLineLength(length, featureIdx) {

		if (this.origMtls === undefined) return;

		var mtl;
		if (featureIdx === undefined) {
			var mtls = this.materials.array;
			for (var i = 0; i < mtls.length; i++) {
				mtl = mtls[i].mtl;
				if (mtl.isLineDashedMaterial) {
					mtl.dashSize = length;
				}
				else if (mtl.isMeshLineMaterial) {
					mtl.uniforms.dashOffset.value = -length;
				}
			}
		}
		else {
			mtl = this.features[featureIdx].objs[0].material;
			if (mtl.isLineDashedMaterial) {
				mtl.dashSize = length;
			}
			else if (mtl.isMeshLineMaterial) {
				mtl.uniforms.dashOffset.value = -length;
			}
		}
	}

}


class Q3DPolygonLayer extends Q3DVectorLayer {

	constructor() {
		super();

		this.type = Q3D.LayerType.Polygon;

		// for overlay
		this.borderVisible = true;
		this.sideVisible = true;
	}

	build(features, startIndex) {

		if (this.properties.objType !== this._lastObjType) this._createObject = null;

		var createObject = this._createObject || this.createObjFunc(this.properties.objType);

		var f, obj;
		for (var fidx = 0; fidx < features.length; fidx++) {
			f = features[fidx];
			obj = createObject(f);
			obj.userData.properties = f.prop;

			this.addFeature(fidx + startIndex, f, [obj]);
		}

		this._lastObjType = this.properties.objType;
		this._createObject = createObject;
	}

	createObjFunc(objType) {

		var materials = this.materials;

		if (objType == "Polygon") {
			return function (f) {
				var geom = new THREE.BufferGeometry();
				geom.setAttribute("position", new THREE.Float32BufferAttribute(f.geom.triangles.v, 3));
				geom.setIndex(f.geom.triangles.f);
				geom = new THREE.Geometry().fromBufferGeometry(geom); // Flat shading doesn't work with combination of
																	// BufferGeometry and Lambert/Toon material.
				return new THREE.Mesh(geom, materials.mtl(f.mtl));
			};
		}
		else if (objType == "Extruded") {
			var createSubObject = function (f, polygon, z) {
				var i, l, j, m;

				var shape = new THREE.Shape(Q3D.Utils.arrayToVec2Array(polygon[0]));
				for (i = 1, l = polygon.length; i < l; i++) {
					shape.holes.push(new THREE.Path(Q3D.Utils.arrayToVec2Array(polygon[i])));
				}

				// extruded geometry
				var geom = new THREE.ExtrudeBufferGeometry(shape, {bevelEnabled: false, depth: f.geom.h});
				var mesh = new THREE.Mesh(geom, materials.mtl(f.mtl.face));
				var z = 0;
				mesh.position.z = z;

				if (f.mtl.edge !== undefined) {
					// edge
					var edge, bnd, v,
						h = f.geom.h,
						mtl = materials.mtl(f.mtl.edge);

					for (i = 0, l = polygon.length; i < l; i++) {
						bnd = polygon[i];

						v = [];
						for (j = 0, m = bnd.length; j < m; j++) {
							v.push(bnd[j][0], bnd[j][1], 0);
						}

						geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(v, 3));

						edge = new THREE.Line(geom, mtl);
						mesh.add(edge);

						edge = new THREE.Line(geom, mtl);
						edge.position.z = h;
						mesh.add(edge);

						// vertical lines
						for (j = 0, m = bnd.length - 1; j < m; j++) {
							v = [bnd[j][0], bnd[j][1], 0,
									bnd[j][0], bnd[j][1], h];

							geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(v, 3));

							edge = new THREE.Line(geom, mtl);
							mesh.add(edge);
						}
					}
				}
				return mesh;
			};

			var polygons, centroids;

			return function (f) {
				polygons = f.geom.polygons;
				centroids = f.geom.centroids;

				if (polygons.length == 1) return createSubObject(f, polygons[0], centroids[0][2]);

				var group = new THREE.Group();
				for (var i = 0, l = polygons.length; i < l; i++) {
					group.add(createSubObject(f, polygons[i], centroids[i][2]));
				}
				return group;
			};
		}
		else if (objType == "Overlay") {

			var _this = this;

			return function (f) {

				var geom = new THREE.BufferGeometry();
				geom.setIndex(f.geom.triangles.f);
				geom.setAttribute("position", new THREE.Float32BufferAttribute(f.geom.triangles.v, 3));
				geom.computeVertexNormals();

				var mesh = new THREE.Mesh(geom, materials.mtl(f.mtl.face));

				var rotation = _this.sceneData.baseExtent.rotation;
				if (rotation) {
					// rotate around center of base extent
					mesh.position.copy(_this.sceneData.pivot).negate();
					mesh.position.applyAxisAngle(Q3D.uv.k, rotation * Q3D.deg2rad);
					mesh.position.add(_this.sceneData.pivot);
					mesh.rotateOnAxis(Q3D.uv.k, rotation * Q3D.deg2rad);
				}

				// borders
				if (f.geom.brdr !== undefined) {
					var bnds, i, l, j, m;
					for (i = 0, l = f.geom.brdr.length; i < l; i++) {
						bnds = f.geom.brdr[i];
						for (j = 0, m = bnds.length; j < m; j++) {
							geom = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(bnds[j], 3));

							mesh.add(new THREE.Line(geom, materials.mtl(f.mtl.brdr)));
						}
					}
				}
				return mesh;
			};
		}
	}

	buildLabels(features) {
		super.buildLabels(features, function (f) { return f.geom.centroids; });
	}

	setBorderVisible(visible) {
		if (this.properties.objType != "Overlay") return;

		this.objectGroup.children.forEach(function (parent) {
			for (var i = 0, l = parent.children.length; i < l; i++) {
				var obj = parent.children[i];
				if (obj instanceof THREE.Line) obj.visible = visible;
			}
		});
		this.borderVisible = visible;
	}

	setSideVisible(visible) {
		if (this.properties.objType != "Overlay") return;

		this.objectGroup.children.forEach(function (parent) {
			for (var i = 0, l = parent.children.length; i < l; i++) {
				var obj = parent.children[i];
				if (obj instanceof THREE.Mesh) obj.visible = visible;
			}
		});
		this.sideVisible = visible;
	}

}


class Q3DModel {

	constructor() {
		this.loaded = false;
	}

	// callback is called when model has been completely loaded
	load(url, callback) {
		var _this = this;
		Q3D.application.loadModelFile(url, function (model) {
			_this.model = model;
			_this._loadCompleted(callback);
		});
	}

	loadData(data, ext, resourcePath, callback) {
		var _this = this;
		Q3D.application.loadModelData(data, ext, resourcePath, function (model) {
			_this.model = model;
			_this._loadCompleted(callback);
		});
	}

	loadJSONObject(jsonObject, callback) {
		if (jsonObject.url !== undefined) {
			this.load(jsonObject.url, callback);
		}
		else {
			var b = atob(jsonObject.base64),
				len = b.length,
				bytes = new Uint8Array(len);

			for (var i = 0; i < len; i++) {
				bytes[i] = b.charCodeAt(i);
			}

			this.loadData(bytes.buffer, jsonObject.ext, jsonObject.resourcePath, callback);
		}
	}

	_loadCompleted(anotherCallback) {
		this.loaded = true;

		if (this._callbacks !== undefined) {
			for (var i = 0; i < this._callbacks.length; i++) {
				this._callbacks[i](this.model);
			}
			this._callbacks = [];
		}

		if (anotherCallback) anotherCallback(this.model);
	}

	callbackOnLoad(callback) {
		if (this.loaded) return callback(this.model);

		if (this._callbacks === undefined) this._callbacks = [];
		this._callbacks.push(callback);
	}

}


class Q3DModels extends THREE.EventDispatcher {

	constructor() {
		super();

		this.models = [];
		this.cache = {};
	}

	loadJSONObject(jsonObject) {
		var _this = this;
		var callback = function (model) {
			_this.dispatchEvent({type: "modelLoaded", model: model});
		};

		var model, url;
		for (var i = 0, l = jsonObject.length; i < l; i++) {

			url = jsonObject[i].url;
			if (url !== undefined && this.cache[url] !== undefined) {
				model = this.cache[url];
			}
			else {
				model = new Q3DModel();
				model.loadJSONObject(jsonObject[i], callback);

				if (url !== undefined) this.cache[url] = model;
			}
			this.models.push(model);
		}
	}

	get(index) {
		return this.models[index];
	}

	clear() {
		this.models = [];
	}

}

Q3D.Group = Q3DGroup;
Q3D.Scene = Q3DScene;
Q3D.Material = Q3DMaterial;
Q3D.Materials = Q3DMaterials;
Q3D.DEMBlock = Q3DDEMBlock;
Q3D.ClippedDEMBlock = Q3DClippedDEMBlock;
Q3D.MapLayer = Q3DMapLayer;
Q3D.DEMLayer = Q3DDEMLayer;
Q3D.VectorLayer = Q3DVectorLayer;
Q3D.PointLayer = Q3DPointLayer;
Q3D.LineLayer = Q3DLineLayer;
Q3D.PolygonLayer = Q3DPolygonLayer;
Q3D.Model = Q3DModel;
Q3D.Models = Q3DModels;


// Q3D.Utils - Utilities
Q3D.Utils = {};

// Put a stick to given position (for debug)
Q3D.Utils.putStick = function (x, y, zFunc, h) {
	if (Q3D.Utils._stick_mat === undefined) Q3D.Utils._stick_mat = new THREE.LineBasicMaterial({color: 0xff0000});
	if (h === undefined) h = 0.2;
	if (zFunc === undefined) {
		zFunc = function (x, y) { return Q3D.application.scene.mapLayers[0].getZ(x, y); };
	}
	var z = zFunc(x, y);
	var geom = new THREE.Geometry();
	geom.vertices.push(new THREE.Vector3(x, y, z + h), new THREE.Vector3(x, y, z));
	var stick = new THREE.Line(geom, Q3D.Utils._stick_mat);
	Q3D.application.scene.add(stick);
};

// convert latitude and longitude in degrees to the following format
// Ndd°mm′ss.ss″, Eddd°mm′ss.ss″
Q3D.Utils.convertToDMS = function (lat, lon) {
	function toDMS(degrees) {
		var deg = Math.floor(degrees),
			m = (degrees - deg) * 60,
			min = Math.floor(m),
			sec = (m - min) * 60;
		return deg + "°" + ("0" + min).slice(-2) + "′" + ((sec < 10) ? "0" : "") + sec.toFixed(2) + "″";
	}

	return ((lat < 0) ? "S" : "N") + toDMS(Math.abs(lat)) + ", " +
		   ((lon < 0) ? "W" : "E") + toDMS(Math.abs(lon));
};

Q3D.Utils.createWallGeometry = function (vert, bzFunc, buffer_geom) {
	var geom = new THREE.Geometry();
	for (var i = 0, l = vert.length; i < l; i += 3) {
		geom.vertices.push(
			new THREE.Vector3(vert[i], vert[i + 1], vert[i + 2]),
			new THREE.Vector3(vert[i], vert[i + 1], bzFunc(vert[i], vert[i + 1]))
		);
	}

	for (var i = 1, i2 = 1, l = vert.length / 3; i < l; i++, i2 += 2) {
		geom.faces.push(
			new THREE.Face3(i2 - 1, i2, i2 + 1),
			new THREE.Face3(i2 + 1, i2, i2 + 2)
		);
	}

	geom.computeFaceNormals();

	if (buffer_geom) {
		return new THREE.BufferGeometry().fromGeometry(geom);
	}
	return geom;
};

Q3D.Utils.arrayToVec2Array = function (points) {
	var pt, pts = [];
	for (var i = 0, l = points.length; i < l; i++) {
		pt = points[i];
		pts.push(new THREE.Vector2(pt[0], pt[1]));
	}
	return pts;
};

Q3D.Utils.flatArrayToVec2Array = function (vertices, itemSize) {
	itemSize = itemSize || 2;
	var pts = [];
	for (var i = 0, l = vertices.length; i < l; i += itemSize) {
		pts.push(new THREE.Vector2(vertices[i], vertices[i + 1]));
	}
	return pts;
};

Q3D.Utils.setGeometryUVs = function (geom, base_width, base_height) {
	var face, v, uvs = [];
	for (var i = 0, l = geom.vertices.length; i < l; i++) {
		v = geom.vertices[i];
		uvs.push(new THREE.Vector2(v.x / base_width + 0.5, v.y / base_height + 0.5));
	}

	geom.faceVertexUvs[0] = [];
	for (var i = 0, l = geom.faces.length; i < l; i++) {
		face = geom.faces[i];
		geom.faceVertexUvs[0].push([uvs[face.a], uvs[face.b], uvs[face.c]]);
	}
};


// Q3D.Tweens
Q3D.Tweens = {};

Q3D.Tweens.cameraMotion = {

	type: Q3D.KeyframeType.CameraMotion,

	curveFactor: 0,

	init: function (group) {

		var app = Q3D.application,
			zScale = app.scene.userData.zScale,
			keyframes = group.keyframes,
			prop_list = [];

		var c = this.curveFactor, p, p0, phi, theta, dist, dist_list = [];
		var vec3 = new THREE.Vector3(),
			o = app.scene.userData.origin;

		for (var i = 0; i < keyframes.length; i++) {
			p = keyframes[i].camera;
			vec3.set(p.x - p.fx, p.y - p.fy, (p.z - p.fz) * zScale);
			dist = vec3.length();
			theta = Math.acos(vec3.z / dist);
			phi = Math.atan2(vec3.y, vec3.x);
			p.phi = phi;
			prop_list.push({p: i, fx: p.fx - o.x, fy: p.fy - o.y, fz: (p.fz - o.z) * zScale, d: dist, theta: theta});  // map to 3D world

			if (i > 0) {
				dist_list.push(Math.sqrt((p.x - p0.x) * (p.x - p0.x) + (p.y - p0.y) * (p.y - p0.y)));
			}
			p0 = p;
		}
		group.prop_list = prop_list;

		var phi0, phi1, dz;
		group.onUpdate = function (obj, elapsed, is_first) {

			p = obj.p - group.currentIndex;
			phi0 = keyframes[group.currentIndex].camera.phi;
			phi1 = (is_first) ? phi0 : keyframes[group.currentIndex + 1].camera.phi;

			if (Math.abs(phi1 - phi0) > Math.PI) {  // take the shortest orbiting path
				phi1 += Math.PI * ((phi1 > phi0) ? -2 : 2);
			}

			phi = phi0 * (1 - p) + phi1 * p;

			vec3.set(Math.cos(phi) * Math.sin(obj.theta),
					 Math.sin(phi) * Math.sin(obj.theta),
					 Math.cos(obj.theta)).setLength(obj.d);

			dz = (c) ? (1 - Math.pow(2 * p - 1, 2)) * dist_list[group.currentIndex] * c : 0;

			app.camera.position.set(obj.fx + vec3.x, obj.fy + vec3.y, obj.fz + vec3.z + dz);
			app.camera.lookAt(obj.fx, obj.fy, obj.fz);
			app.controls.target.set(obj.fx, obj.fy, obj.fz);
		};

		// initial position
		group.onUpdate(group.prop_list[0], 1, true);
	}

};

Q3D.Tweens.opacity = {

	type: Q3D.KeyframeType.Opacity,

	init: function (group, layer) {

		var keyframes = group.keyframes;

		for (var i = 0; i < keyframes.length; i++) {
			group.prop_list.push({opacity: keyframes[i].opacity});
		}

		group.onUpdate = function (obj, elapsed) {
			layer.opacity = obj.opacity;
		};

		// initial opacity
		group.onUpdate(group.prop_list[0]);
	}

};

Q3D.Tweens.texture = {

	type: Q3D.KeyframeType.Texture,

	init: function (group, layer) {

		var keyframes = group.keyframes;

		var idx_from, from, to, effect;

		group.onStart = function () {
			idx_from = group.currentIndex;
			effect = keyframes[idx_from].effect;
			from = keyframes[idx_from].mtlIndex;
			to = keyframes[idx_from + 1].mtlIndex;

			layer.prepareTexAnimation(from, to);
			layer.setTextureAt(null, effect);
		};

		group.onUpdate = function (obj, elapsed) {
			layer.setTextureAt(obj.p - group.currentIndex, effect);
		};

		for (var i = 0; i < keyframes.length; i++) {
			group.prop_list.push({p: i});
		}
	}
};

Q3D.Tweens.lineGrowing = {

	type: Q3D.KeyframeType.GrowingLine,

	init: function (group, layer) {
		if (group._keyframes === undefined) group._keyframes = group.keyframes;

		var effectItem = group._keyframes[0];
		if (effectItem.sequential) {
			group.keyframes = [];

			var item;
			for (var i = 0; i < layer.features.length; i++) {
				item = layer.features[i].anim;
				item.easing = effectItem.easing;
				group.keyframes.push(item);
				group.prop_list.push({p: i});
			}
			group.keyframes.push({});
			group.prop_list.push({p: i});

			group.onUpdate = function (obj, elapsed) {
				layer.setLineLength(obj.p - group.currentIndex, group.currentIndex);
			};
		}
		else {
			group.keyframes = [effectItem, {}];
			group.prop_list = [{p: 0}, {p: 1}];

			group.onUpdate = function (obj, elapsed) {
				layer.setLineLength(obj.p);
			};
		}

		layer.prepareAnimation(effectItem.sequential);
		layer.setLineLength(0);
	}

};



var retrieved_data = [
  {
    "wkt_geom": "MultiPolygon (((190105 179091, 190105 178891, 189905 178891, 189905 179091, 190105 179091)))",
    "lon": 190005,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 1,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 179091, 190305 178891, 190105 178891, 190105 179091, 190305 179091)))",
    "lon": 190205,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 2,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 179091, 190505 178891, 190305 178891, 190305 179091, 190505 179091)))",
    "lon": 190405,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 3,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 179091, 190705 178891, 190505 178891, 190505 179091, 190705 179091)))",
    "lon": 190605,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 4,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 179091, 190905 178891, 190705 178891, 190705 179091, 190905 179091)))",
    "lon": 190805,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 5,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 179091, 191105 178891, 190905 178891, 190905 179091, 191105 179091)))",
    "lon": 191005,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 6,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 179091, 191305 178891, 191105 178891, 191105 179091, 191305 179091)))",
    "lon": 191205,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 7,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 179091, 191505 178891, 191305 178891, 191305 179091, 191505 179091)))",
    "lon": 191405,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 8,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 179091, 191705 178891, 191505 178891, 191505 179091, 191705 179091)))",
    "lon": 191605,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 9,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 179091, 191905 178891, 191705 178891, 191705 179091, 191905 179091)))",
    "lon": 191805,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 10,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 179091, 192105 178891, 191905 178891, 191905 179091, 192105 179091)))",
    "lon": 192005,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 11,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 179091, 192305 178891, 192105 178891, 192105 179091, 192305 179091)))",
    "lon": 192205,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 12,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 179091, 192505 178891, 192305 178891, 192305 179091, 192505 179091)))",
    "lon": 192405,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 13,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 179091, 192705 178891, 192505 178891, 192505 179091, 192705 179091)))",
    "lon": 192605,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 14,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 179091, 192905 178891, 192705 178891, 192705 179091, 192905 179091)))",
    "lon": 192805,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 15,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 179091, 193105 178891, 192905 178891, 192905 179091, 193105 179091)))",
    "lon": 193005,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 16,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 179091, 193305 178891, 193105 178891, 193105 179091, 193305 179091)))",
    "lon": 193205,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 17,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 179091, 193505 178891, 193305 178891, 193305 179091, 193505 179091)))",
    "lon": 193405,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 18,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 179091, 193705 178891, 193505 178891, 193505 179091, 193705 179091)))",
    "lon": 193605,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 19,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 179091, 193905 178891, 193705 178891, 193705 179091, 193905 179091)))",
    "lon": 193805,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 20,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 179091, 194105 178891, 193905 178891, 193905 179091, 194105 179091)))",
    "lon": 194005,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 21,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 179091, 194305 178891, 194105 178891, 194105 179091, 194305 179091)))",
    "lon": 194205,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 22,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 179091, 194505 178891, 194305 178891, 194305 179091, 194505 179091)))",
    "lon": 194405,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 23,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 179091, 194705 178891, 194505 178891, 194505 179091, 194705 179091)))",
    "lon": 194605,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 24,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 179091, 194905 178891, 194705 178891, 194705 179091, 194905 179091)))",
    "lon": 194805,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 25,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 179091, 195105 178891, 194905 178891, 194905 179091, 195105 179091)))",
    "lon": 195005,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 26,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 179091, 195305 178891, 195105 178891, 195105 179091, 195305 179091)))",
    "lon": 195205,
    "lat": 178991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 27,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 179291, 190105 179091, 189905 179091, 189905 179291, 190105 179291)))",
    "lon": 190005,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 28,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 179291, 190305 179091, 190105 179091, 190105 179291, 190305 179291)))",
    "lon": 190205,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 29,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 179291, 190505 179091, 190305 179091, 190305 179291, 190505 179291)))",
    "lon": 190405,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 30,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 179291, 190705 179091, 190505 179091, 190505 179291, 190705 179291)))",
    "lon": 190605,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 31,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 179291, 190905 179091, 190705 179091, 190705 179291, 190905 179291)))",
    "lon": 190805,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 32,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 179291, 191105 179091, 190905 179091, 190905 179291, 191105 179291)))",
    "lon": 191005,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 33,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 179291, 191305 179091, 191105 179091, 191105 179291, 191305 179291)))",
    "lon": 191205,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 34,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 179291, 191505 179091, 191305 179091, 191305 179291, 191505 179291)))",
    "lon": 191405,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 35,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 179291, 191705 179091, 191505 179091, 191505 179291, 191705 179291)))",
    "lon": 191605,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 36,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 179291, 191905 179091, 191705 179091, 191705 179291, 191905 179291)))",
    "lon": 191805,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 37,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 179291, 192105 179091, 191905 179091, 191905 179291, 192105 179291)))",
    "lon": 192005,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 38,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 179291, 192305 179091, 192105 179091, 192105 179291, 192305 179291)))",
    "lon": 192205,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 39,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 179291, 192505 179091, 192305 179091, 192305 179291, 192505 179291)))",
    "lon": 192405,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 40,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 179291, 192705 179091, 192505 179091, 192505 179291, 192705 179291)))",
    "lon": 192605,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 41,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 179291, 192905 179091, 192705 179091, 192705 179291, 192905 179291)))",
    "lon": 192805,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 42,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 179291, 193105 179091, 192905 179091, 192905 179291, 193105 179291)))",
    "lon": 193005,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 43,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 179291, 193305 179091, 193105 179091, 193105 179291, 193305 179291)))",
    "lon": 193205,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 44,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 179291, 193505 179091, 193305 179091, 193305 179291, 193505 179291)))",
    "lon": 193405,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 45,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 179291, 193705 179091, 193505 179091, 193505 179291, 193705 179291)))",
    "lon": 193605,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 46,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 179291, 193905 179091, 193705 179091, 193705 179291, 193905 179291)))",
    "lon": 193805,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 47,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 179291, 194105 179091, 193905 179091, 193905 179291, 194105 179291)))",
    "lon": 194005,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 48,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 179291, 194305 179091, 194105 179091, 194105 179291, 194305 179291)))",
    "lon": 194205,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 49,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 179291, 194505 179091, 194305 179091, 194305 179291, 194505 179291)))",
    "lon": 194405,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 50,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 179291, 194705 179091, 194505 179091, 194505 179291, 194705 179291)))",
    "lon": 194605,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 51,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 179291, 194905 179091, 194705 179091, 194705 179291, 194905 179291)))",
    "lon": 194805,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 52,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 179291, 195105 179091, 194905 179091, 194905 179291, 195105 179291)))",
    "lon": 195005,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 53,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 179291, 195305 179091, 195105 179091, 195105 179291, 195305 179291)))",
    "lon": 195205,
    "lat": 179191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 54,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 179491, 190105 179291, 189905 179291, 189905 179491, 190105 179491)))",
    "lon": 190005,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 55,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 179491, 190305 179291, 190105 179291, 190105 179491, 190305 179491)))",
    "lon": 190205,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 56,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 179491, 190505 179291, 190305 179291, 190305 179491, 190505 179491)))",
    "lon": 190405,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 57,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 179491, 190705 179291, 190505 179291, 190505 179491, 190705 179491)))",
    "lon": 190605,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 58,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 179491, 190905 179291, 190705 179291, 190705 179491, 190905 179491)))",
    "lon": 190805,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 59,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 179491, 191105 179291, 190905 179291, 190905 179491, 191105 179491)))",
    "lon": 191005,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 60,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 179491, 191305 179291, 191105 179291, 191105 179491, 191305 179491)))",
    "lon": 191205,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 61,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 179491, 191505 179291, 191305 179291, 191305 179491, 191505 179491)))",
    "lon": 191405,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 62,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 179491, 191705 179291, 191505 179291, 191505 179491, 191705 179491)))",
    "lon": 191605,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 63,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 179491, 191905 179291, 191705 179291, 191705 179491, 191905 179491)))",
    "lon": 191805,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 64,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 179491, 192105 179291, 191905 179291, 191905 179491, 192105 179491)))",
    "lon": 192005,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 65,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 179491, 192305 179291, 192105 179291, 192105 179491, 192305 179491)))",
    "lon": 192205,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 66,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 179491, 192505 179291, 192305 179291, 192305 179491, 192505 179491)))",
    "lon": 192405,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 67,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 179491, 192705 179291, 192505 179291, 192505 179491, 192705 179491)))",
    "lon": 192605,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 68,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 179491, 192905 179291, 192705 179291, 192705 179491, 192905 179491)))",
    "lon": 192805,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 69,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 179491, 193105 179291, 192905 179291, 192905 179491, 193105 179491)))",
    "lon": 193005,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 70,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 179491, 193305 179291, 193105 179291, 193105 179491, 193305 179491)))",
    "lon": 193205,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 71,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 179491, 193505 179291, 193305 179291, 193305 179491, 193505 179491)))",
    "lon": 193405,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 72,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 179491, 193705 179291, 193505 179291, 193505 179491, 193705 179491)))",
    "lon": 193605,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 73,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 179491, 193905 179291, 193705 179291, 193705 179491, 193905 179491)))",
    "lon": 193805,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 74,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 179491, 194105 179291, 193905 179291, 193905 179491, 194105 179491)))",
    "lon": 194005,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 75,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 179491, 194305 179291, 194105 179291, 194105 179491, 194305 179491)))",
    "lon": 194205,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 76,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 179491, 194505 179291, 194305 179291, 194305 179491, 194505 179491)))",
    "lon": 194405,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 77,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 179491, 194705 179291, 194505 179291, 194505 179491, 194705 179491)))",
    "lon": 194605,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 78,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 179491, 194905 179291, 194705 179291, 194705 179491, 194905 179491)))",
    "lon": 194805,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 79,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 179491, 195105 179291, 194905 179291, 194905 179491, 195105 179491)))",
    "lon": 195005,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 80,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 179491, 195305 179291, 195105 179291, 195105 179491, 195305 179491)))",
    "lon": 195205,
    "lat": 179391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 81,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 179691, 190105 179491, 189905 179491, 189905 179691, 190105 179691)))",
    "lon": 190005,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 82,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 179691, 190305 179491, 190105 179491, 190105 179691, 190305 179691)))",
    "lon": 190205,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 83,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 179691, 190505 179491, 190305 179491, 190305 179691, 190505 179691)))",
    "lon": 190405,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 84,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 179691, 190705 179491, 190505 179491, 190505 179691, 190705 179691)))",
    "lon": 190605,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 85,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 179691, 190905 179491, 190705 179491, 190705 179691, 190905 179691)))",
    "lon": 190805,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 86,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 179691, 191105 179491, 190905 179491, 190905 179691, 191105 179691)))",
    "lon": 191005,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 87,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 179691, 191305 179491, 191105 179491, 191105 179691, 191305 179691)))",
    "lon": 191205,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 88,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 179691, 191505 179491, 191305 179491, 191305 179691, 191505 179691)))",
    "lon": 191405,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 89,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 179691, 191705 179491, 191505 179491, 191505 179691, 191705 179691)))",
    "lon": 191605,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 90,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 179691, 191905 179491, 191705 179491, 191705 179691, 191905 179691)))",
    "lon": 191805,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 91,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 179691, 192105 179491, 191905 179491, 191905 179691, 192105 179691)))",
    "lon": 192005,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 92,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 179691, 192305 179491, 192105 179491, 192105 179691, 192305 179691)))",
    "lon": 192205,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 93,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 179691, 192505 179491, 192305 179491, 192305 179691, 192505 179691)))",
    "lon": 192405,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 94,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 179691, 192705 179491, 192505 179491, 192505 179691, 192705 179691)))",
    "lon": 192605,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 95,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 179691, 192905 179491, 192705 179491, 192705 179691, 192905 179691)))",
    "lon": 192805,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 96,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 179691, 193105 179491, 192905 179491, 192905 179691, 193105 179691)))",
    "lon": 193005,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 97,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 179691, 193305 179491, 193105 179491, 193105 179691, 193305 179691)))",
    "lon": 193205,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 1210.265551,
    "Factory_pc": 3.024986219,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 768.5535181,
    "Park_pc": 1.920953463,
    "Govern_PCT": 0,
    "Factory__1": 0.00017,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00011,
    "id": 98,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 179691, 193505 179491, 193305 179491, 193305 179691, 193505 179691)))",
    "lon": 193405,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 10856.60025,
    "Park_pc": 27.13541996,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0015,
    "id": 99,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 179691, 193705 179491, 193505 179491, 193505 179691, 193705 179691)))",
    "lon": 193605,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 100,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 179691, 193905 179491, 193705 179491, 193705 179691, 193905 179691)))",
    "lon": 193805,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 101,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 179691, 194105 179491, 193905 179491, 193905 179691, 194105 179691)))",
    "lon": 194005,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 102,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 179691, 194305 179491, 194105 179491, 194105 179691, 194305 179691)))",
    "lon": 194205,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 103,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 179691, 194505 179491, 194305 179491, 194305 179691, 194505 179691)))",
    "lon": 194405,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 104,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 179691, 194705 179491, 194505 179491, 194505 179691, 194705 179691)))",
    "lon": 194605,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 105,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 179691, 194905 179491, 194705 179491, 194705 179691, 194905 179691)))",
    "lon": 194805,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 106,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 179691, 195105 179491, 194905 179491, 194905 179691, 195105 179691)))",
    "lon": 195005,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 107,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 179691, 195305 179491, 195105 179491, 195105 179691, 195305 179691)))",
    "lon": 195205,
    "lat": 179591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 108,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 179891, 190105 179691, 189905 179691, 189905 179891, 190105 179891)))",
    "lon": 190005,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 109,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 179891, 190305 179691, 190105 179691, 190105 179891, 190305 179891)))",
    "lon": 190205,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 110,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 179891, 190505 179691, 190305 179691, 190305 179891, 190505 179891)))",
    "lon": 190405,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 111,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 179891, 190705 179691, 190505 179691, 190505 179891, 190705 179891)))",
    "lon": 190605,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 112,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 179891, 190905 179691, 190705 179691, 190705 179891, 190905 179891)))",
    "lon": 190805,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 113,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 179891, 191105 179691, 190905 179691, 190905 179891, 191105 179891)))",
    "lon": 191005,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 114,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 179891, 191305 179691, 191105 179691, 191105 179891, 191305 179891)))",
    "lon": 191205,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 115,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 179891, 191505 179691, 191305 179691, 191305 179891, 191505 179891)))",
    "lon": 191405,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 116,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 179891, 191705 179691, 191505 179691, 191505 179891, 191705 179891)))",
    "lon": 191605,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 323.0482982,
    "Govermen_1": 0.807440345,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00004,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 117,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 179891, 191905 179691, 191705 179691, 191705 179891, 191905 179891)))",
    "lon": 191805,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 7051.85723,
    "Govermen_1": 17.62570366,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00098,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 118,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 179891, 192105 179691, 191905 179691, 191905 179891, 192105 179891)))",
    "lon": 192005,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 18284.09468,
    "Govermen_1": 45.70001892,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00253,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 119,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 179891, 192305 179691, 192105 179691, 192105 179891, 192305 179891)))",
    "lon": 192205,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 12387.17855,
    "Govermen_1": 30.96102157,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00171,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 120,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 179891, 192505 179691, 192305 179691, 192305 179891, 192505 179891)))",
    "lon": 192405,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 5976.545447,
    "Park_pc": 14.93802142,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00083,
    "id": 121,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 179891, 192705 179691, 192505 179691, 192505 179891, 192705 179891)))",
    "lon": 192605,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 105.3770547,
    "Park_pc": 0.263383688,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00001,
    "id": 122,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 179891, 192905 179691, 192705 179691, 192705 179891, 192905 179891)))",
    "lon": 192805,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 2170.904841,
    "Factory_pc": 5.426047301,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.0003,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 123,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 179891, 193105 179691, 192905 179691, 192905 179891, 193105 179891)))",
    "lon": 193005,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 22435.47131,
    "Factory_pc": 56.07611983,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.0031,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 124,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 179891, 193305 179691, 193105 179691, 193105 179891, 193305 179891)))",
    "lon": 193205,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 27761.48093,
    "Factory_pc": 69.3881579,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6541.799389,
    "Park_pc": 16.35083554,
    "Govern_PCT": 0,
    "Factory__1": 0.00384,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0009,
    "id": 125,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 179891, 193505 179691, 193305 179691, 193305 179891, 193505 179891)))",
    "lon": 193405,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 31398.93625,
    "Park_pc": 78.4797543,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00434,
    "id": 126,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 179891, 193705 179691, 193505 179691, 193505 179891, 193705 179891)))",
    "lon": 193605,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 127,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 179891, 193905 179691, 193705 179691, 193705 179891, 193905 179891)))",
    "lon": 193805,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 128,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 179891, 194105 179691, 193905 179691, 193905 179891, 194105 179891)))",
    "lon": 194005,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9393.333299,
    "Park_pc": 23.47806774,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0013,
    "id": 129,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 179891, 194305 179691, 194105 179691, 194105 179891, 194305 179891)))",
    "lon": 194205,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 130,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 179891, 194505 179691, 194305 179691, 194305 179891, 194505 179891)))",
    "lon": 194405,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 131,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 179891, 194705 179691, 194505 179691, 194505 179891, 194705 179891)))",
    "lon": 194605,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 132,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 179891, 194905 179691, 194705 179691, 194705 179891, 194905 179891)))",
    "lon": 194805,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 133,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 179891, 195105 179691, 194905 179691, 194905 179891, 195105 179891)))",
    "lon": 195005,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 134,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 179891, 195305 179691, 195105 179691, 195105 179891, 195305 179891)))",
    "lon": 195205,
    "lat": 179791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 135,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 180091, 190105 179891, 189905 179891, 189905 180091, 190105 180091)))",
    "lon": 190005,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 136,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 180091, 190305 179891, 190105 179891, 190105 180091, 190305 180091)))",
    "lon": 190205,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 137,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 180091, 190505 179891, 190305 179891, 190305 180091, 190505 180091)))",
    "lon": 190405,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 138,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 180091, 190705 179891, 190505 179891, 190505 180091, 190705 180091)))",
    "lon": 190605,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 139,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 180091, 190905 179891, 190705 179891, 190705 180091, 190905 180091)))",
    "lon": 190805,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 140,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 180091, 191105 179891, 190905 179891, 190905 180091, 191105 180091)))",
    "lon": 191005,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 141,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 180091, 191305 179891, 191105 179891, 191105 180091, 191305 180091)))",
    "lon": 191205,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 12241.53441,
    "Park_pc": 30.59700512,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00169,
    "id": 142,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 180091, 191505 179891, 191305 179891, 191305 180091, 191505 180091)))",
    "lon": 191405,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 30087.99874,
    "Park_pc": 75.20320099,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00416,
    "id": 143,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 180091, 191705 179891, 191505 179891, 191505 180091, 191705 180091)))",
    "lon": 191605,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 14520.46662,
    "Factory_pc": 36.29305782,
    "Goverment_": 4477.101346,
    "Govermen_1": 11.1902532,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00062,
    "Factory__1": 0.00201,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 144,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 180091, 191905 179891, 191705 179891, 191705 180091, 191905 180091)))",
    "lon": 191805,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 6162.040554,
    "Factory_pc": 15.40165903,
    "Goverment_": 20122.27004,
    "Govermen_1": 50.29443402,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00278,
    "Factory__1": 0.00085,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 145,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 180091, 192105 179891, 191905 179891, 191905 180091, 192105 180091)))",
    "lon": 192005,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 12058.5139,
    "Factory_pc": 30.13954601,
    "Goverment_": 15889.60621,
    "Govermen_1": 39.71513581,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.0022,
    "Factory__1": 0.00167,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 146,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 180091, 192305 179891, 192105 179891, 192105 180091, 192305 180091)))",
    "lon": 192205,
    "lat": 179991,
    "Commercial": 4634.440949,
    "Commerci_1": 11.58351157,
    "Factory_ar": 10400.85817,
    "Factory_pc": 25.99633101,
    "Goverment_": 8486.076795,
    "Govermen_1": 21.210448,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00117,
    "Factory__1": 0.00144,
    "Commerc_PC": 0.00064,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 147,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 180091, 192505 179891, 192305 179891, 192305 180091, 192505 180091)))",
    "lon": 192405,
    "lat": 179991,
    "Commercial": 22908.85314,
    "Commerci_1": 57.25932171,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 3024.472814,
    "Park_pc": 7.559490683,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00317,
    "House_PCT": 0,
    "Park_PCT": 0.00042,
    "id": 148,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 180091, 192705 179891, 192505 179891, 192505 180091, 192705 180091)))",
    "lon": 192605,
    "lat": 179991,
    "Commercial": 2944.010223,
    "Commerci_1": 7.358378659,
    "Factory_ar": 7951.109823,
    "Factory_pc": 19.87332665,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 344.9277093,
    "Park_pc": 0.862126318,
    "Govern_PCT": 0,
    "Factory__1": 0.0011,
    "Commerc_PC": 0.00041,
    "House_PCT": 0,
    "Park_PCT": 0.00005,
    "id": 149,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 180091, 192905 179891, 192705 179891, 192705 180091, 192905 180091)))",
    "lon": 192805,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 32243.43565,
    "Factory_pc": 80.59054614,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00446,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 150,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 180091, 193105 179891, 192905 179891, 192905 180091, 193105 180091)))",
    "lon": 193005,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 33146.88461,
    "Factory_pc": 82.84865719,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00458,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 151,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 180091, 193305 179891, 193105 179891, 193105 180091, 193305 180091)))",
    "lon": 193205,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 32915.99608,
    "Factory_pc": 82.27155952,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6.766771948,
    "Park_pc": 0.016913141,
    "Govern_PCT": 0,
    "Factory__1": 0.00455,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 152,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 180091, 193505 179891, 193305 179891, 193305 180091, 193505 180091)))",
    "lon": 193405,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 31826.72791,
    "Park_pc": 79.54899374,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0044,
    "id": 153,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 180091, 193705 179891, 193505 179891, 193505 180091, 193705 180091)))",
    "lon": 193605,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 189.7848822,
    "Park_pc": 0.474355877,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00003,
    "id": 154,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 180091, 193905 179891, 193705 179891, 193705 180091, 193905 180091)))",
    "lon": 193805,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 582.9442284,
    "Park_pc": 1.457033883,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00008,
    "id": 155,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 180091, 194105 179891, 193905 179891, 193905 180091, 194105 180091)))",
    "lon": 194005,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9876.054678,
    "Park_pc": 24.68460056,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00137,
    "id": 156,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 180091, 194305 179891, 194105 179891, 194105 180091, 194305 180091)))",
    "lon": 194205,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6113.330934,
    "Park_pc": 15.27989955,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00085,
    "id": 157,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 180091, 194505 179891, 194305 179891, 194305 180091, 194505 180091)))",
    "lon": 194405,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 158,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 180091, 194705 179891, 194505 179891, 194505 180091, 194705 180091)))",
    "lon": 194605,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 159,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 180091, 194905 179891, 194705 179891, 194705 180091, 194905 180091)))",
    "lon": 194805,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 160,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 180091, 195105 179891, 194905 179891, 194905 180091, 195105 180091)))",
    "lon": 195005,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 161,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 180091, 195305 179891, 195105 179891, 195105 180091, 195305 180091)))",
    "lon": 195205,
    "lat": 179991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 162,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 180291, 190105 180091, 189905 180091, 189905 180291, 190105 180291)))",
    "lon": 190005,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 163,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 180291, 190305 180091, 190105 180091, 190105 180291, 190305 180291)))",
    "lon": 190205,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 164,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 180291, 190505 180091, 190305 180091, 190305 180291, 190505 180291)))",
    "lon": 190405,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 165,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 180291, 190705 180091, 190505 180091, 190505 180291, 190705 180291)))",
    "lon": 190605,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 166,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 180291, 190905 180091, 190705 180091, 190705 180291, 190905 180291)))",
    "lon": 190805,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 167,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 180291, 191105 180091, 190905 180091, 190905 180291, 191105 180291)))",
    "lon": 191005,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 168,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 180291, 191305 180091, 191105 180091, 191105 180291, 191305 180291)))",
    "lon": 191205,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 15844.65332,
    "Park_pc": 39.60279177,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00219,
    "id": 169,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 180291, 191505 180091, 191305 180091, 191305 180291, 191505 180291)))",
    "lon": 191405,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 196.91399,
    "Factory_pc": 0.492175052,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 37680.2112,
    "Park_pc": 94.17949388,
    "Govern_PCT": 0,
    "Factory__1": 0.00003,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00521,
    "id": 170,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 180291, 191705 180091, 191505 180091, 191505 180291, 191705 180291)))",
    "lon": 191605,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 17906.12318,
    "Factory_pc": 44.75530852,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 553.6668271,
    "Park_pc": 1.38385788,
    "Govern_PCT": 0,
    "Factory__1": 0.00248,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00008,
    "id": 171,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 180291, 191905 180091, 191705 180091, 191705 180291, 191905 180291)))",
    "lon": 191805,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 25983.05597,
    "Factory_pc": 64.94312471,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00359,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 172,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 180291, 192105 180091, 191905 180091, 191905 180291, 192105 180291)))",
    "lon": 192005,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 31948.60656,
    "Factory_pc": 79.85366221,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00442,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 173,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 180291, 192305 180091, 192105 180091, 192105 180291, 192305 180291)))",
    "lon": 192205,
    "lat": 180191,
    "Commercial": 1055.588957,
    "Commerci_1": 2.638382282,
    "Factory_ar": 28767.72579,
    "Factory_pc": 71.9032323,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 2504.687832,
    "Park_pc": 6.260319372,
    "Govern_PCT": 0,
    "Factory__1": 0.00398,
    "Commerc_PC": 0.00015,
    "House_PCT": 0,
    "Park_PCT": 0.00035,
    "id": 174,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 180291, 192505 180091, 192305 180091, 192305 180291, 192505 180291)))",
    "lon": 192405,
    "lat": 180191,
    "Commercial": 7787.093677,
    "Commerci_1": 19.46337946,
    "Factory_ar": 3904.281526,
    "Factory_pc": 9.758520444,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 15167.42042,
    "Park_pc": 37.91006905,
    "Govern_PCT": 0,
    "Factory__1": 0.00054,
    "Commerc_PC": 0.00108,
    "House_PCT": 0,
    "Park_PCT": 0.0021,
    "id": 175,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 180291, 192705 180091, 192505 180091, 192505 180291, 192705 180291)))",
    "lon": 192605,
    "lat": 180191,
    "Commercial": 1034.868872,
    "Commerci_1": 2.586593263,
    "Factory_ar": 17496.61751,
    "Factory_pc": 43.73175601,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00242,
    "Commerc_PC": 0.00014,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 176,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 180291, 192905 180091, 192705 180091, 192705 180291, 192905 180291)))",
    "lon": 192805,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 28773.78347,
    "Factory_pc": 71.91835718,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00398,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 177,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 180291, 193105 180091, 192905 180091, 192905 180291, 193105 180291)))",
    "lon": 193005,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 31326.64829,
    "Factory_pc": 78.29908519,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00433,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 178,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 180291, 193305 180091, 193105 180091, 193105 180291, 193305 180291)))",
    "lon": 193205,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 32484.83788,
    "Factory_pc": 81.19390534,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 4112.791387,
    "Park_pc": 10.27967558,
    "Govern_PCT": 0,
    "Factory__1": 0.00449,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00057,
    "id": 179,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 180291, 193505 180091, 193305 180091, 193305 180291, 193505 180291)))",
    "lon": 193405,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 27652.60519,
    "Park_pc": 69.11602479,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00382,
    "id": 180,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 180291, 193705 180091, 193505 180091, 193505 180291, 193705 180291)))",
    "lon": 193605,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 2577.367531,
    "Park_pc": 6.441974834,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00036,
    "id": 181,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 180291, 193905 180091, 193705 180091, 193705 180291, 193905 180291)))",
    "lon": 193805,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 31759.10081,
    "Park_pc": 79.37995379,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00439,
    "id": 182,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 180291, 194105 180091, 193905 180091, 193905 180291, 194105 180291)))",
    "lon": 194005,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 183,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 180291, 194305 180091, 194105 180091, 194105 180291, 194305 180291)))",
    "lon": 194205,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 17557.97576,
    "Park_pc": 43.88509447,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00243,
    "id": 184,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 180291, 194505 180091, 194305 180091, 194305 180291, 194505 180291)))",
    "lon": 194405,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 185,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 180291, 194705 180091, 194505 180091, 194505 180291, 194705 180291)))",
    "lon": 194605,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 186,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 180291, 194905 180091, 194705 180091, 194705 180291, 194905 180291)))",
    "lon": 194805,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 187,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 180291, 195105 180091, 194905 180091, 194905 180291, 195105 180291)))",
    "lon": 195005,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 188,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 180291, 195305 180091, 195105 180091, 195105 180291, 195305 180291)))",
    "lon": 195205,
    "lat": 180191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 189,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 180491, 190105 180291, 189905 180291, 189905 180491, 190105 180491)))",
    "lon": 190005,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 190,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 180491, 190305 180291, 190105 180291, 190105 180491, 190305 180491)))",
    "lon": 190205,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 191,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 180491, 190505 180291, 190305 180291, 190305 180491, 190505 180491)))",
    "lon": 190405,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 192,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 180491, 190705 180291, 190505 180291, 190505 180491, 190705 180491)))",
    "lon": 190605,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 193,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 180491, 190905 180291, 190705 180291, 190705 180491, 190905 180491)))",
    "lon": 190805,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 194,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 180491, 191105 180291, 190905 180291, 190905 180491, 191105 180491)))",
    "lon": 191005,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 195,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 180491, 191305 180291, 191105 180291, 191105 180491, 191305 180491)))",
    "lon": 191205,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 5691.849916,
    "Park_pc": 14.22644865,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00079,
    "id": 196,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 180491, 191505 180291, 191305 180291, 191305 180491, 191505 180491)))",
    "lon": 191405,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 10639.90703,
    "Factory_pc": 26.59382805,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 24278.65785,
    "Park_pc": 60.68309154,
    "Govern_PCT": 0,
    "Factory__1": 0.00147,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00336,
    "id": 197,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 180491, 191705 180291, 191505 180291, 191505 180491, 191705 180491)))",
    "lon": 191605,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 19422.88053,
    "Factory_pc": 48.5463548,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00269,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 198,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 180491, 191905 180291, 191705 180291, 191705 180491, 191905 180491)))",
    "lon": 191805,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 21078.66742,
    "Factory_pc": 52.68489306,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00292,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 199,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 180491, 192105 180291, 191905 180291, 191905 180491, 192105 180491)))",
    "lon": 192005,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 29344.42326,
    "Factory_pc": 73.34465921,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00406,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 200,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 180491, 192305 180291, 192105 180291, 192105 180491, 192305 180491)))",
    "lon": 192205,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 30827.46773,
    "Factory_pc": 77.05143559,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 191.6303003,
    "Park_pc": 0.478968622,
    "Govern_PCT": 0,
    "Factory__1": 0.00426,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00003,
    "id": 201,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 180491, 192505 180291, 192305 180291, 192305 180491, 192505 180491)))",
    "lon": 192405,
    "lat": 180391,
    "Commercial": 1635.425485,
    "Commerci_1": 4.087649136,
    "Factory_ar": 5216.941197,
    "Factory_pc": 13.03943553,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 22080.69689,
    "Park_pc": 55.18939409,
    "Govern_PCT": 0,
    "Factory__1": 0.00072,
    "Commerc_PC": 0.00023,
    "House_PCT": 0,
    "Park_PCT": 0.00305,
    "id": 202,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 180491, 192705 180291, 192505 180291, 192505 180491, 192705 180491)))",
    "lon": 192605,
    "lat": 180391,
    "Commercial": 3059.710644,
    "Commerci_1": 7.647564969,
    "Factory_ar": 17710.94231,
    "Factory_pc": 44.26744805,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00245,
    "Commerc_PC": 0.00042,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 203,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 180491, 192905 180291, 192705 180291, 192705 180491, 192905 180491)))",
    "lon": 192805,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 36682.01758,
    "Factory_pc": 91.68451699,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00507,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 204,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 180491, 193105 180291, 192905 180291, 192905 180491, 193105 180491)))",
    "lon": 193005,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 31700.13974,
    "Factory_pc": 79.23260467,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 1351.929186,
    "Park_pc": 3.3790662,
    "Govern_PCT": 0,
    "Factory__1": 0.00438,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00019,
    "id": 205,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 180491, 193305 180291, 193105 180291, 193105 180491, 193305 180491)))",
    "lon": 193205,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 4260.039718,
    "Factory_pc": 10.64771394,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 29014.01795,
    "Park_pc": 72.51879886,
    "Govern_PCT": 0,
    "Factory__1": 0.00059,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00401,
    "id": 206,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 180491, 193505 180291, 193305 180291, 193305 180491, 193505 180491)))",
    "lon": 193405,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 4818.464619,
    "Park_pc": 12.04346272,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00067,
    "id": 207,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 180491, 193705 180291, 193505 180291, 193505 180491, 193705 180491)))",
    "lon": 193605,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 23825.76124,
    "Park_pc": 59.55105443,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0033,
    "id": 208,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 180491, 193905 180291, 193705 180291, 193705 180491, 193905 180491)))",
    "lon": 193805,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 39032.35244,
    "Park_pc": 97.55900669,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0054,
    "id": 209,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 180491, 194105 180291, 193905 180291, 193905 180491, 194105 180491)))",
    "lon": 194005,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 379.4118413,
    "Park_pc": 0.948316917,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00005,
    "id": 210,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 180491, 194305 180291, 194105 180291, 194105 180491, 194305 180491)))",
    "lon": 194205,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 23558.03859,
    "Park_pc": 58.88188719,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00326,
    "id": 211,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 180491, 194505 180291, 194305 180291, 194305 180491, 194505 180491)))",
    "lon": 194405,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 7539.758204,
    "Park_pc": 18.84516682,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00104,
    "id": 212,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 180491, 194705 180291, 194505 180291, 194505 180491, 194705 180491)))",
    "lon": 194605,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 213,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 180491, 194905 180291, 194705 180291, 194705 180491, 194905 180491)))",
    "lon": 194805,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 214,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 180491, 195105 180291, 194905 180291, 194905 180491, 195105 180491)))",
    "lon": 195005,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 215,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 180491, 195305 180291, 195105 180291, 195105 180491, 195305 180491)))",
    "lon": 195205,
    "lat": 180391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 216,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 180691, 190105 180491, 189905 180491, 189905 180691, 190105 180691)))",
    "lon": 190005,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 217,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 180691, 190305 180491, 190105 180491, 190105 180691, 190305 180691)))",
    "lon": 190205,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 218,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 180691, 190505 180491, 190305 180491, 190305 180691, 190505 180691)))",
    "lon": 190405,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 219,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 180691, 190705 180491, 190505 180491, 190505 180691, 190705 180691)))",
    "lon": 190605,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 220,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 180691, 190905 180491, 190705 180491, 190705 180691, 190905 180691)))",
    "lon": 190805,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 221,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 180691, 191105 180491, 190905 180491, 190905 180691, 191105 180691)))",
    "lon": 191005,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 222,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 180691, 191305 180491, 191105 180491, 191105 180691, 191305 180691)))",
    "lon": 191205,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 223,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 180691, 191505 180491, 191305 180491, 191305 180691, 191505 180691)))",
    "lon": 191405,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 4157.714695,
    "Factory_pc": 10.39196576,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 18108.81093,
    "Park_pc": 45.26191839,
    "Govern_PCT": 0,
    "Factory__1": 0.00058,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0025,
    "id": 224,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 180691, 191705 180491, 191505 180491, 191505 180691, 191705 180691)))",
    "lon": 191605,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 16296.40161,
    "Factory_pc": 40.73190341,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00225,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 225,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 180691, 191905 180491, 191705 180491, 191705 180691, 191905 180691)))",
    "lon": 191805,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 36232.86248,
    "Factory_pc": 90.56191482,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00501,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 226,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 180691, 192105 180491, 191905 180491, 191905 180691, 192105 180691)))",
    "lon": 192005,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 33002.1614,
    "Factory_pc": 82.48696036,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00456,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 227,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 180691, 192305 180491, 192105 180491, 192105 180691, 192305 180691)))",
    "lon": 192205,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 38467.59497,
    "Factory_pc": 96.14748246,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00532,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 228,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 180691, 192505 180491, 192305 180491, 192305 180691, 192505 180691)))",
    "lon": 192405,
    "lat": 180591,
    "Commercial": 24905.04604,
    "Commerci_1": 62.24868743,
    "Factory_ar": 4017.937551,
    "Factory_pc": 10.04259692,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00056,
    "Commerc_PC": 0.00344,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 229,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 180691, 192705 180491, 192505 180491, 192505 180691, 192705 180691)))",
    "lon": 192605,
    "lat": 180591,
    "Commercial": 14387.8445,
    "Commerci_1": 35.96156247,
    "Factory_ar": 4915.399968,
    "Factory_pc": 12.28575017,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00068,
    "Commerc_PC": 0.00199,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 230,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 180691, 192905 180491, 192705 180491, 192705 180691, 192905 180691)))",
    "lon": 192805,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 35821.7939,
    "Factory_pc": 89.53443904,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00495,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 231,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 180691, 193105 180491, 192905 180491, 192905 180691, 193105 180691)))",
    "lon": 193005,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 16430.79546,
    "Factory_pc": 41.06779118,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 18743.12954,
    "Park_pc": 46.847332,
    "Govern_PCT": 0,
    "Factory__1": 0.00227,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00259,
    "id": 232,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 180691, 193305 180491, 193105 180491, 193105 180691, 193305 180691)))",
    "lon": 193205,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9423.975615,
    "Park_pc": 23.55466218,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0013,
    "id": 233,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 180691, 193505 180491, 193305 180491, 193305 180691, 193505 180691)))",
    "lon": 193405,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 11858.64989,
    "Park_pc": 29.63998264,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00164,
    "id": 234,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 180691, 193705 180491, 193505 180491, 193505 180691, 193705 180691)))",
    "lon": 193605,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 39678.38522,
    "Park_pc": 99.17373263,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00549,
    "id": 235,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 180691, 193905 180491, 193705 180491, 193705 180691, 193905 180691)))",
    "lon": 193805,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 40008.96873,
    "Park_pc": 100,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00553,
    "id": 236,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 180691, 194105 180491, 193905 180491, 193905 180691, 194105 180691)))",
    "lon": 194005,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 2712.645436,
    "Park_pc": 6.780092963,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00038,
    "id": 237,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 180691, 194305 180491, 194105 180491, 194105 180691, 194305 180691)))",
    "lon": 194205,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 22789.54788,
    "Park_pc": 56.96109126,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00315,
    "id": 238,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 180691, 194505 180491, 194305 180491, 194305 180691, 194505 180691)))",
    "lon": 194405,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 13307.1347,
    "Park_pc": 33.26037336,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00184,
    "id": 239,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 180691, 194705 180491, 194505 180491, 194505 180691, 194705 180691)))",
    "lon": 194605,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 240,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 180691, 194905 180491, 194705 180491, 194705 180691, 194905 180691)))",
    "lon": 194805,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 241,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 180691, 195105 180491, 194905 180491, 194905 180691, 195105 180691)))",
    "lon": 195005,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 242,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 180691, 195305 180491, 195105 180491, 195105 180691, 195305 180691)))",
    "lon": 195205,
    "lat": 180591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 243,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 180891, 190105 180691, 189905 180691, 189905 180891, 190105 180891)))",
    "lon": 190005,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 244,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 180891, 190305 180691, 190105 180691, 190105 180891, 190305 180891)))",
    "lon": 190205,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 245,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 180891, 190505 180691, 190305 180691, 190305 180891, 190505 180891)))",
    "lon": 190405,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 246,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 180891, 190705 180691, 190505 180691, 190505 180891, 190705 180891)))",
    "lon": 190605,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 247,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 180891, 190905 180691, 190705 180691, 190705 180891, 190905 180891)))",
    "lon": 190805,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 248,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 180891, 191105 180691, 190905 180691, 190905 180891, 191105 180891)))",
    "lon": 191005,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 249,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 180891, 191305 180691, 191105 180691, 191105 180891, 191305 180891)))",
    "lon": 191205,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 250,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 180891, 191505 180691, 191305 180691, 191305 180891, 191505 180891)))",
    "lon": 191405,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 15943.20319,
    "Park_pc": 39.84910789,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00221,
    "id": 251,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 180891, 191705 180691, 191505 180691, 191505 180891, 191705 180891)))",
    "lon": 191605,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 3801.315843,
    "Factory_pc": 9.501166777,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 36.8492675,
    "Park_pc": 0.09210259,
    "Govern_PCT": 0,
    "Factory__1": 0.00053,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00001,
    "id": 252,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 180891, 191905 180691, 191705 180691, 191705 180891, 191905 180891)))",
    "lon": 191805,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 12964.30593,
    "Factory_pc": 32.4035223,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00179,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 253,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 180891, 192105 180691, 191905 180691, 191905 180891, 192105 180891)))",
    "lon": 192005,
    "lat": 180791,
    "Commercial": 12823.10829,
    "Commerci_1": 32.05060454,
    "Factory_ar": 12191.68687,
    "Factory_pc": 30.47240387,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00169,
    "Commerc_PC": 0.00177,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 254,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 180891, 192305 180691, 192105 180691, 192105 180891, 192305 180891)))",
    "lon": 192205,
    "lat": 180791,
    "Commercial": 24083.93819,
    "Commerci_1": 60.19638149,
    "Factory_ar": 362.1023281,
    "Factory_pc": 0.905053389,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00005,
    "Commerc_PC": 0.00333,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 255,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 180891, 192505 180691, 192305 180691, 192305 180891, 192505 180891)))",
    "lon": 192405,
    "lat": 180791,
    "Commercial": 19994.64378,
    "Commerci_1": 49.97542777,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00277,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 256,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 180891, 192705 180691, 192505 180691, 192505 180891, 192705 180891)))",
    "lon": 192605,
    "lat": 180791,
    "Commercial": 13118.3743,
    "Commerci_1": 32.7885971,
    "Factory_ar": 734.3685652,
    "Factory_pc": 1.835510594,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.0001,
    "Commerc_PC": 0.00181,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 257,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 180891, 192905 180691, 192705 180691, 192705 180891, 192905 180891)))",
    "lon": 192805,
    "lat": 180791,
    "Commercial": 7531.063344,
    "Commerci_1": 18.82344399,
    "Factory_ar": 13132.61612,
    "Factory_pc": 32.82419132,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 16.10390338,
    "Park_pc": 0.040250747,
    "Govern_PCT": 0,
    "Factory__1": 0.00182,
    "Commerc_PC": 0.00104,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 258,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 180891, 193105 180691, 192905 180691, 192905 180891, 193105 180891)))",
    "lon": 193005,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 4219.517642,
    "Factory_pc": 10.54643213,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6745.935333,
    "Park_pc": 16.86106214,
    "Govern_PCT": 0,
    "Factory__1": 0.00058,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00093,
    "id": 259,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 180891, 193305 180691, 193105 180691, 193105 180891, 193305 180891)))",
    "lon": 193205,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 1321.728468,
    "Govermen_1": 3.303581077,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 4853.442598,
    "Park_pc": 12.13088885,
    "Govern_PCT": 0.00018,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00067,
    "id": 260,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 180891, 193505 180691, 193305 180691, 193305 180891, 193505 180891)))",
    "lon": 193405,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 36.69949492,
    "Govermen_1": 0.091728182,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 31541.47144,
    "Park_pc": 78.83601198,
    "Govern_PCT": 0.00001,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00436,
    "id": 261,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 180891, 193705 180691, 193505 180691, 193505 180891, 193705 180891)))",
    "lon": 193605,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 40008.96629,
    "Park_pc": 100,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00553,
    "id": 262,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 180891, 193905 180691, 193705 180691, 193705 180891, 193905 180891)))",
    "lon": 193805,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 33984.09706,
    "Park_pc": 84.94119718,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0047,
    "id": 263,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 180891, 194105 180691, 193905 180691, 193905 180891, 194105 180891)))",
    "lon": 194005,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 730.9536006,
    "Park_pc": 1.826974248,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0001,
    "id": 264,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 180891, 194305 180691, 194105 180691, 194105 180891, 194305 180891)))",
    "lon": 194205,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9631.812936,
    "Park_pc": 24.07413161,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00133,
    "id": 265,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 180891, 194505 180691, 194305 180691, 194305 180891, 194505 180891)))",
    "lon": 194405,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 266,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 180891, 194705 180691, 194505 180691, 194505 180891, 194705 180891)))",
    "lon": 194605,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 267,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 180891, 194905 180691, 194705 180691, 194705 180891, 194905 180891)))",
    "lon": 194805,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 268,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 180891, 195105 180691, 194905 180691, 194905 180891, 195105 180891)))",
    "lon": 195005,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 269,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 180891, 195305 180691, 195105 180691, 195105 180891, 195305 180891)))",
    "lon": 195205,
    "lat": 180791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 270,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 181091, 190105 180891, 189905 180891, 189905 181091, 190105 181091)))",
    "lon": 190005,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 271,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 181091, 190305 180891, 190105 180891, 190105 181091, 190305 181091)))",
    "lon": 190205,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 272,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 181091, 190505 180891, 190305 180891, 190305 181091, 190505 181091)))",
    "lon": 190405,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 273,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 181091, 190705 180891, 190505 180891, 190505 181091, 190705 181091)))",
    "lon": 190605,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 274,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 181091, 190905 180891, 190705 180891, 190705 181091, 190905 181091)))",
    "lon": 190805,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 275,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 181091, 191105 180891, 190905 180891, 190905 181091, 191105 181091)))",
    "lon": 191005,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 276,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 181091, 191305 180891, 191105 180891, 191105 181091, 191305 181091)))",
    "lon": 191205,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 277,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 181091, 191505 180891, 191305 180891, 191305 181091, 191505 181091)))",
    "lon": 191405,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 11199.6692,
    "Park_pc": 27.99292089,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00155,
    "id": 278,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 181091, 191705 180891, 191505 180891, 191505 181091, 191705 181091)))",
    "lon": 191605,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 1466.120217,
    "Govermen_1": 3.66448179,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 11133.49088,
    "Park_pc": 27.82750972,
    "Govern_PCT": 0.0002,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00154,
    "id": 279,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 181091, 191905 180891, 191705 180891, 191705 181091, 191905 181091)))",
    "lon": 191805,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 16579.79474,
    "Govermen_1": 41.4402245,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00229,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 280,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 181091, 192105 180891, 191905 180891, 191905 181091, 192105 181091)))",
    "lon": 192005,
    "lat": 180991,
    "Commercial": 11822.45411,
    "Commerci_1": 29.54952826,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 10383.87193,
    "Govermen_1": 25.95387676,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 1681.479205,
    "Park_pc": 4.202758312,
    "Govern_PCT": 0.00144,
    "Factory__1": 0,
    "Commerc_PC": 0.00164,
    "House_PCT": 0,
    "Park_PCT": 0.00023,
    "id": 281,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 181091, 192305 180891, 192105 180891, 192105 181091, 192305 181091)))",
    "lon": 192205,
    "lat": 180991,
    "Commercial": 27005.88296,
    "Commerci_1": 67.49960984,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 2314.818109,
    "House_pc": 5.78575118,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00374,
    "House_PCT": 0.00032,
    "Park_PCT": 0,
    "id": 282,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 181091, 192505 180891, 192305 180891, 192305 181091, 192505 181091)))",
    "lon": 192405,
    "lat": 180991,
    "Commercial": 19330.97206,
    "Commerci_1": 48.31661956,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 771.310892,
    "House_pc": 1.927845885,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00267,
    "House_PCT": 0.00011,
    "Park_PCT": 0,
    "id": 283,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 181091, 192705 180891, 192505 180891, 192505 181091, 192705 181091)))",
    "lon": 192605,
    "lat": 180991,
    "Commercial": 23839.96747,
    "Commerci_1": 59.5865821,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.0033,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 284,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 181091, 192905 180891, 192705 180891, 192705 181091, 192905 181091)))",
    "lon": 192805,
    "lat": 180991,
    "Commercial": 12918.08759,
    "Commerci_1": 32.28798999,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 5998.31914,
    "Park_pc": 14.99244118,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00179,
    "House_PCT": 0,
    "Park_PCT": 0.00083,
    "id": 285,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 181091, 193105 180891, 192905 180891, 192905 181091, 193105 181091)))",
    "lon": 193005,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 5709.028214,
    "Park_pc": 14.26937476,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00079,
    "id": 286,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 181091, 193305 180891, 193105 180891, 193105 181091, 193305 181091)))",
    "lon": 193205,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 20208.75513,
    "Govermen_1": 50.51057202,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 4359.328807,
    "Park_pc": 10.89588103,
    "Govern_PCT": 0.0028,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0006,
    "id": 287,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 181091, 193505 180891, 193305 180891, 193305 181091, 193505 181091)))",
    "lon": 193405,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 16187.18819,
    "Govermen_1": 40.45890386,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 8502.686475,
    "Park_pc": 21.25195374,
    "Govern_PCT": 0.00224,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00118,
    "id": 288,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 181091, 193705 180891, 193505 180891, 193505 181091, 193705 181091)))",
    "lon": 193605,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 225.6708152,
    "Govermen_1": 0.564050601,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 18582.45677,
    "Park_pc": 46.44573071,
    "Govern_PCT": 0.00003,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00257,
    "id": 289,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 181091, 193905 180891, 193705 180891, 193705 181091, 193905 181091)))",
    "lon": 193805,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6598.377807,
    "Park_pc": 16.49224662,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00091,
    "id": 290,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 181091, 194105 180891, 193905 180891, 193905 181091, 194105 181091)))",
    "lon": 194005,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 291,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 181091, 194305 180891, 194105 180891, 194105 181091, 194305 181091)))",
    "lon": 194205,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 292,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 181091, 194505 180891, 194305 180891, 194305 181091, 194505 181091)))",
    "lon": 194405,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 293,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 181091, 194705 180891, 194505 180891, 194505 181091, 194705 181091)))",
    "lon": 194605,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 294,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 181091, 194905 180891, 194705 180891, 194705 181091, 194905 181091)))",
    "lon": 194805,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 295,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 181091, 195105 180891, 194905 180891, 194905 181091, 195105 181091)))",
    "lon": 195005,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 296,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 181091, 195305 180891, 195105 180891, 195105 181091, 195305 181091)))",
    "lon": 195205,
    "lat": 180991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 297,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 181291, 190105 181091, 189905 181091, 189905 181291, 190105 181291)))",
    "lon": 190005,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 298,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 181291, 190305 181091, 190105 181091, 190105 181291, 190305 181291)))",
    "lon": 190205,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 299,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 181291, 190505 181091, 190305 181091, 190305 181291, 190505 181291)))",
    "lon": 190405,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 300,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 181291, 190705 181091, 190505 181091, 190505 181291, 190705 181291)))",
    "lon": 190605,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 301,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 181291, 190905 181091, 190705 181091, 190705 181291, 190905 181291)))",
    "lon": 190805,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 302,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 181291, 191105 181091, 190905 181091, 190905 181291, 191105 181291)))",
    "lon": 191005,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 303,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 181291, 191305 181091, 191105 181091, 191105 181291, 191305 181291)))",
    "lon": 191205,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 304,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 181291, 191505 181091, 191305 181091, 191305 181291, 191505 181291)))",
    "lon": 191405,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 7176.532386,
    "Park_pc": 17.93732472,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00099,
    "id": 305,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 181291, 191705 181091, 191505 181091, 191505 181291, 191705 181291)))",
    "lon": 191605,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 303.3086929,
    "Govermen_1": 0.758102349,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 21059.06059,
    "Park_pc": 52.635891,
    "Govern_PCT": 0.00004,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00291,
    "id": 306,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 181291, 191905 181091, 191705 181091, 191705 181291, 191905 181291)))",
    "lon": 191805,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 31059.45398,
    "Govermen_1": 77.6312834,
    "House_area": 3.273514873,
    "House_pc": 0.008181958,
    "Park_area": 3342.047446,
    "Park_pc": 8.353251559,
    "Govern_PCT": 0.0043,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00046,
    "id": 307,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 181291, 192105 181091, 191905 181091, 191905 181291, 192105 181291)))",
    "lon": 192005,
    "lat": 181191,
    "Commercial": 1278.956418,
    "Commerci_1": 3.196676292,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 6976.052252,
    "Govermen_1": 17.43623202,
    "House_area": 9949.034258,
    "House_pc": 24.86702557,
    "Park_area": 3389.854376,
    "Park_pc": 8.472741501,
    "Govern_PCT": 0.00096,
    "Factory__1": 0,
    "Commerc_PC": 0.00018,
    "House_PCT": 0.00138,
    "Park_PCT": 0.00047,
    "id": 308,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 181291, 192305 181091, 192105 181091, 192105 181291, 192305 181291)))",
    "lon": 192205,
    "lat": 181191,
    "Commercial": 62.82816117,
    "Commerci_1": 0.157035279,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 18433.40472,
    "House_pc": 46.07320661,
    "Park_area": 821.8321437,
    "Park_pc": 2.054120914,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00001,
    "House_PCT": 0.00255,
    "Park_PCT": 0.00011,
    "id": 309,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 181291, 192505 181091, 192305 181091, 192305 181291, 192505 181291)))",
    "lon": 192405,
    "lat": 181191,
    "Commercial": 5531.491927,
    "Commerci_1": 13.82563639,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 4986.049609,
    "House_pc": 12.46233563,
    "Park_area": 3434.727415,
    "Park_pc": 8.584897702,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00077,
    "House_PCT": 0.00069,
    "Park_PCT": 0.00048,
    "id": 310,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 181291, 192705 181091, 192505 181091, 192505 181291, 192705 181291)))",
    "lon": 192605,
    "lat": 181191,
    "Commercial": 6843.597529,
    "Commerci_1": 17.10516535,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 65.24771224,
    "Park_pc": 0.163082779,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00095,
    "House_PCT": 0,
    "Park_PCT": 0.00001,
    "id": 311,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 181291, 192905 181091, 192705 181091, 192705 181291, 192905 181291)))",
    "lon": 192805,
    "lat": 181191,
    "Commercial": 686.9643145,
    "Commerci_1": 1.717026358,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 7164.870385,
    "Park_pc": 17.90816647,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.0001,
    "House_PCT": 0,
    "Park_PCT": 0.00099,
    "id": 312,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 181291, 193105 181091, 192905 181091, 192905 181291, 193105 181291)))",
    "lon": 193005,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9684.745745,
    "Park_pc": 24.20644305,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00134,
    "id": 313,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 181291, 193305 181091, 193105 181091, 193105 181291, 193305 181291)))",
    "lon": 193205,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 13971.2966,
    "Govermen_1": 34.9204183,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 2070.484217,
    "Park_pc": 5.175051178,
    "Govern_PCT": 0.00193,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00029,
    "id": 314,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 181291, 193505 181091, 193305 181091, 193305 181291, 193505 181291)))",
    "lon": 193405,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 9831.740918,
    "Govermen_1": 24.5738454,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 12183.28418,
    "Park_pc": 30.45138642,
    "Govern_PCT": 0.00136,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00169,
    "id": 315,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 181291, 193705 181091, 193505 181091, 193505 181291, 193705 181291)))",
    "lon": 193605,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 10141.66095,
    "Park_pc": 25.34847026,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0014,
    "id": 316,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 181291, 193905 181091, 193705 181091, 193705 181291, 193905 181291)))",
    "lon": 193805,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 317,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 181291, 194105 181091, 193905 181091, 193905 181291, 194105 181291)))",
    "lon": 194005,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 318,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 181291, 194305 181091, 194105 181091, 194105 181291, 194305 181291)))",
    "lon": 194205,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 319,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 181291, 194505 181091, 194305 181091, 194305 181291, 194505 181291)))",
    "lon": 194405,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 320,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 181291, 194705 181091, 194505 181091, 194505 181291, 194705 181291)))",
    "lon": 194605,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 321,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 181291, 194905 181091, 194705 181091, 194705 181291, 194905 181291)))",
    "lon": 194805,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 322,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 181291, 195105 181091, 194905 181091, 194905 181291, 195105 181291)))",
    "lon": 195005,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 323,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 181291, 195305 181091, 195105 181091, 195105 181291, 195305 181291)))",
    "lon": 195205,
    "lat": 181191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 324,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 181491, 190105 181291, 189905 181291, 189905 181491, 190105 181491)))",
    "lon": 190005,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 325,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 181491, 190305 181291, 190105 181291, 190105 181491, 190305 181491)))",
    "lon": 190205,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 326,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 181491, 190505 181291, 190305 181291, 190305 181491, 190505 181491)))",
    "lon": 190405,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 327,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 181491, 190705 181291, 190505 181291, 190505 181491, 190705 181491)))",
    "lon": 190605,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 328,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 181491, 190905 181291, 190705 181291, 190705 181491, 190905 181491)))",
    "lon": 190805,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 329,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 181491, 191105 181291, 190905 181291, 190905 181491, 191105 181491)))",
    "lon": 191005,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 330,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 181491, 191305 181291, 191105 181291, 191105 181491, 191305 181491)))",
    "lon": 191205,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 331,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 181491, 191505 181291, 191305 181291, 191305 181491, 191505 181491)))",
    "lon": 191405,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 595.9012704,
    "House_pc": 1.489420517,
    "Park_area": 14149.45668,
    "Park_pc": 35.36574284,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00008,
    "Park_PCT": 0.00196,
    "id": 332,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 181491, 191705 181291, 191505 181291, 191505 181491, 191705 181491)))",
    "lon": 191605,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 2663.453878,
    "House_pc": 6.657147276,
    "Park_area": 15950.76503,
    "Park_pc": 39.86800478,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00037,
    "Park_PCT": 0.00221,
    "id": 333,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 181491, 191905 181291, 191705 181291, 191705 181491, 191905 181491)))",
    "lon": 191805,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 372.7610554,
    "Govermen_1": 0.931694392,
    "House_area": 831.2198478,
    "House_pc": 2.077585251,
    "Park_area": 19433.46882,
    "Park_pc": 48.57281536,
    "Govern_PCT": 0.00005,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00011,
    "Park_PCT": 0.00269,
    "id": 334,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 181491, 192105 181291, 191905 181291, 191905 181491, 192105 181491)))",
    "lon": 192005,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 17409.56146,
    "House_pc": 43.51417416,
    "Park_area": 7392.767739,
    "Park_pc": 18.47778784,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00241,
    "Park_PCT": 0.00102,
    "id": 335,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 181491, 192305 181291, 192105 181291, 192105 181491, 192305 181491)))",
    "lon": 192205,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 25775.16116,
    "House_pc": 64.42349322,
    "Park_area": 1035.684847,
    "Park_pc": 2.588633115,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00356,
    "Park_PCT": 0.00014,
    "id": 336,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 181491, 192505 181291, 192305 181291, 192305 181491, 192505 181491)))",
    "lon": 192405,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 3791.842983,
    "House_pc": 9.477486897,
    "Park_area": 21309.24005,
    "Park_pc": 53.26118308,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00052,
    "Park_PCT": 0.00295,
    "id": 337,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 181491, 192705 181291, 192505 181291, 192505 181491, 192705 181491)))",
    "lon": 192605,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 13065.54053,
    "Park_pc": 32.65654209,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00181,
    "id": 338,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 181491, 192905 181291, 192705 181291, 192705 181491, 192905 181491)))",
    "lon": 192805,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1805.967275,
    "House_pc": 4.513907556,
    "Park_area": 9188.166289,
    "Park_pc": 22.96527396,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00025,
    "Park_PCT": 0.00127,
    "id": 339,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 181491, 193105 181291, 192905 181291, 192905 181491, 193105 181491)))",
    "lon": 193005,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 9557.784626,
    "Govermen_1": 23.88911129,
    "House_area": 3109.00155,
    "House_pc": 7.770763512,
    "Park_area": 1359.719427,
    "Park_pc": 3.398537421,
    "Govern_PCT": 0.00132,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00043,
    "Park_PCT": 0.00019,
    "id": 340,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 181491, 193305 181291, 193105 181291, 193105 181491, 193305 181491)))",
    "lon": 193205,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 14319.9533,
    "Govermen_1": 35.79186477,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 15528.71781,
    "Park_pc": 38.8130992,
    "Govern_PCT": 0.00198,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00215,
    "id": 341,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 181491, 193505 181291, 193305 181291, 193305 181491, 193505 181491)))",
    "lon": 193405,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 3944.709656,
    "Govermen_1": 9.859564642,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 8483.053038,
    "Park_pc": 21.20288109,
    "Govern_PCT": 0.00055,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00117,
    "id": 342,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 181491, 193705 181291, 193505 181291, 193505 181491, 193705 181491)))",
    "lon": 193605,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 821.1335811,
    "Park_pc": 2.052373891,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00011,
    "id": 343,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 181491, 193905 181291, 193705 181291, 193705 181491, 193905 181491)))",
    "lon": 193805,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 344,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 181491, 194105 181291, 193905 181291, 193905 181491, 194105 181491)))",
    "lon": 194005,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 345,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 181491, 194305 181291, 194105 181291, 194105 181491, 194305 181491)))",
    "lon": 194205,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 346,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 181491, 194505 181291, 194305 181291, 194305 181491, 194505 181491)))",
    "lon": 194405,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 347,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 181491, 194705 181291, 194505 181291, 194505 181491, 194705 181491)))",
    "lon": 194605,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 348,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 181491, 194905 181291, 194705 181291, 194705 181491, 194905 181491)))",
    "lon": 194805,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 349,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 181491, 195105 181291, 194905 181291, 194905 181491, 195105 181491)))",
    "lon": 195005,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 350,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 181491, 195305 181291, 195105 181291, 195105 181491, 195305 181491)))",
    "lon": 195205,
    "lat": 181391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 351,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 181691, 190105 181491, 189905 181491, 189905 181691, 190105 181691)))",
    "lon": 190005,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 352,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 181691, 190305 181491, 190105 181491, 190105 181691, 190305 181691)))",
    "lon": 190205,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 353,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 181691, 190505 181491, 190305 181491, 190305 181691, 190505 181691)))",
    "lon": 190405,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 354,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 181691, 190705 181491, 190505 181491, 190505 181691, 190705 181691)))",
    "lon": 190605,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 355,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 181691, 190905 181491, 190705 181491, 190705 181691, 190905 181691)))",
    "lon": 190805,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 356,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 181691, 191105 181491, 190905 181491, 190905 181691, 191105 181691)))",
    "lon": 191005,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 357,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 181691, 191305 181491, 191105 181491, 191105 181691, 191305 181691)))",
    "lon": 191205,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 358,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 181691, 191505 181491, 191305 181491, 191305 181691, 191505 181691)))",
    "lon": 191405,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1630.2986,
    "House_pc": 4.074836389,
    "Park_area": 15386.22088,
    "Park_pc": 38.45696285,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00023,
    "Park_PCT": 0.00213,
    "id": 359,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 181691, 191705 181491, 191505 181491, 191505 181691, 191705 181691)))",
    "lon": 191605,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 12047.58927,
    "House_pc": 30.1122451,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00167,
    "Park_PCT": 0,
    "id": 360,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 181691, 191905 181491, 191705 181491, 191705 181691, 191905 181691)))",
    "lon": 191805,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 13353.53348,
    "House_pc": 33.37637359,
    "Park_area": 5362.849805,
    "Park_pc": 13.40412849,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00185,
    "Park_PCT": 0.00074,
    "id": 361,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 181691, 192105 181491, 191905 181491, 191905 181691, 192105 181691)))",
    "lon": 192005,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 676.7820976,
    "House_pc": 1.691577017,
    "Park_area": 14733.88393,
    "Park_pc": 36.82647562,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00009,
    "Park_PCT": 0.00204,
    "id": 362,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 181691, 192305 181491, 192105 181491, 192105 181691, 192305 181691)))",
    "lon": 192205,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 4788.875603,
    "House_pc": 11.96951176,
    "Park_area": 19756.63515,
    "Park_pc": 49.3805428,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00066,
    "Park_PCT": 0.00273,
    "id": 363,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 181691, 192505 181491, 192305 181491, 192305 181691, 192505 181691)))",
    "lon": 192405,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 17363.79588,
    "Park_pc": 43.39977907,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0024,
    "id": 364,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 181691, 192705 181491, 192505 181491, 192505 181691, 192705 181691)))",
    "lon": 192605,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 15220.43763,
    "Park_pc": 38.04257929,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00211,
    "id": 365,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 181691, 192905 181491, 192705 181491, 192705 181691, 192905 181691)))",
    "lon": 192805,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11088.83051,
    "House_pc": 27.71587085,
    "Park_area": 11264.28015,
    "Park_pc": 28.15439677,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00153,
    "Park_PCT": 0.00156,
    "id": 366,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 181691, 193105 181491, 192905 181491, 192905 181691, 193105 181691)))",
    "lon": 193005,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 28.32132109,
    "Govermen_1": 0.070787449,
    "House_area": 13899.80301,
    "House_pc": 34.74172662,
    "Park_area": 9859.064432,
    "Park_pc": 24.64214212,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00192,
    "Park_PCT": 0.00136,
    "id": 367,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 181691, 193305 181491, 193105 181491, 193105 181691, 193305 181691)))",
    "lon": 193205,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 2889.25037,
    "House_pc": 7.221508076,
    "Park_area": 1997.487233,
    "Park_pc": 4.99259958,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0004,
    "Park_PCT": 0.00028,
    "id": 368,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 181691, 193505 181491, 193305 181491, 193305 181691, 193505 181691)))",
    "lon": 193405,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1611.180803,
    "House_pc": 4.027049553,
    "Park_area": 8008.920688,
    "Park_pc": 20.01781576,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00022,
    "Park_PCT": 0.00111,
    "id": 369,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 181691, 193705 181491, 193505 181491, 193505 181691, 193705 181691)))",
    "lon": 193605,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 370,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 181691, 193905 181491, 193705 181491, 193705 181691, 193905 181691)))",
    "lon": 193805,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 371,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 181691, 194105 181491, 193905 181491, 193905 181691, 194105 181691)))",
    "lon": 194005,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 372,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 181691, 194305 181491, 194105 181491, 194105 181691, 194305 181691)))",
    "lon": 194205,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 373,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 181691, 194505 181491, 194305 181491, 194305 181691, 194505 181691)))",
    "lon": 194405,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 374,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 181691, 194705 181491, 194505 181491, 194505 181691, 194705 181691)))",
    "lon": 194605,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 375,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 181691, 194905 181491, 194705 181491, 194705 181691, 194905 181691)))",
    "lon": 194805,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 376,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 181691, 195105 181491, 194905 181491, 194905 181691, 195105 181691)))",
    "lon": 195005,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 377,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 181691, 195305 181491, 195105 181491, 195105 181691, 195305 181691)))",
    "lon": 195205,
    "lat": 181591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 378,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 181891, 190105 181691, 189905 181691, 189905 181891, 190105 181891)))",
    "lon": 190005,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 379,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 181891, 190305 181691, 190105 181691, 190105 181891, 190305 181891)))",
    "lon": 190205,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 380,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 181891, 190505 181691, 190305 181691, 190305 181891, 190505 181891)))",
    "lon": 190405,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 381,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 181891, 190705 181691, 190505 181691, 190505 181891, 190705 181891)))",
    "lon": 190605,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 382,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 181891, 190905 181691, 190705 181691, 190705 181891, 190905 181891)))",
    "lon": 190805,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 383,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 181891, 191105 181691, 190905 181691, 190905 181891, 191105 181891)))",
    "lon": 191005,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 384,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 181891, 191305 181691, 191105 181691, 191105 181891, 191305 181891)))",
    "lon": 191205,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 385,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 181891, 191505 181691, 191305 181691, 191305 181891, 191505 181891)))",
    "lon": 191405,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 5031.039096,
    "House_pc": 12.57478915,
    "Park_area": 15595.44245,
    "Park_pc": 38.97989994,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0007,
    "Park_PCT": 0.00216,
    "id": 386,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 181891, 191705 181691, 191505 181691, 191505 181891, 191705 181891)))",
    "lon": 191605,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 7553.81945,
    "House_pc": 18.88033011,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00104,
    "Park_PCT": 0,
    "id": 387,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 181891, 191905 181691, 191705 181691, 191705 181891, 191905 181891)))",
    "lon": 191805,
    "lat": 181791,
    "Commercial": 1079.579353,
    "Commerci_1": 2.698345259,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 16980.05117,
    "House_pc": 42.44064176,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00015,
    "House_PCT": 0.00235,
    "Park_PCT": 0,
    "id": 388,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 181891, 192105 181691, 191905 181691, 191905 181891, 192105 181891)))",
    "lon": 192005,
    "lat": 181791,
    "Commercial": 6165.434957,
    "Commerci_1": 15.41014175,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 9239.106547,
    "House_pc": 23.09260296,
    "Park_area": 208.4386379,
    "Park_pc": 0.520980106,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00085,
    "House_PCT": 0.00128,
    "Park_PCT": 0.00003,
    "id": 389,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 181891, 192305 181691, 192105 181691, 192105 181891, 192305 181891)))",
    "lon": 192205,
    "lat": 181791,
    "Commercial": 9591.070627,
    "Commerci_1": 23.97231459,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9835.279868,
    "Park_pc": 24.58270117,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00133,
    "House_PCT": 0,
    "Park_PCT": 0.00136,
    "id": 390,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 181891, 192505 181691, 192305 181691, 192305 181891, 192505 181891)))",
    "lon": 192405,
    "lat": 181791,
    "Commercial": 3659.883291,
    "Commerci_1": 9.147661444,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 14505.35104,
    "Park_pc": 36.25526551,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00051,
    "House_PCT": 0,
    "Park_PCT": 0.00201,
    "id": 391,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 181891, 192705 181691, 192505 181691, 192505 181891, 192705 181891)))",
    "lon": 192605,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 7670.174379,
    "Park_pc": 19.171145,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00106,
    "id": 392,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 181891, 192905 181691, 192705 181691, 192705 181891, 192905 181891)))",
    "lon": 192805,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 947.2341969,
    "House_pc": 2.367555407,
    "Park_area": 17435.76714,
    "Park_pc": 43.57966055,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00013,
    "Park_PCT": 0.00241,
    "id": 393,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 181891, 193105 181691, 192905 181691, 192905 181891, 193105 181891)))",
    "lon": 193005,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 35079.99565,
    "House_pc": 87.68035177,
    "Park_area": 3637.700274,
    "Park_pc": 9.092214345,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00485,
    "Park_PCT": 0.0005,
    "id": 394,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 181891, 193305 181691, 193105 181691, 193105 181891, 193305 181891)))",
    "lon": 193205,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 25782.67275,
    "House_pc": 64.44224468,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00357,
    "Park_PCT": 0,
    "id": 395,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 181891, 193505 181691, 193305 181691, 193305 181891, 193505 181891)))",
    "lon": 193405,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 9676.529463,
    "House_pc": 24.18590361,
    "Park_area": 10404.79,
    "Park_pc": 26.00614704,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00134,
    "Park_PCT": 0.00144,
    "id": 396,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 181891, 193705 181691, 193505 181691, 193505 181891, 193705 181891)))",
    "lon": 193605,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 397,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 181891, 193905 181691, 193705 181691, 193705 181891, 193905 181891)))",
    "lon": 193805,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 398,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 181891, 194105 181691, 193905 181691, 193905 181891, 194105 181891)))",
    "lon": 194005,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 399,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 181891, 194305 181691, 194105 181691, 194105 181891, 194305 181891)))",
    "lon": 194205,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 400,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 181891, 194505 181691, 194305 181691, 194305 181891, 194505 181891)))",
    "lon": 194405,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 401,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 181891, 194705 181691, 194505 181691, 194505 181891, 194705 181891)))",
    "lon": 194605,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 402,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 181891, 194905 181691, 194705 181691, 194705 181891, 194905 181891)))",
    "lon": 194805,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 403,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 181891, 195105 181691, 194905 181691, 194905 181891, 195105 181891)))",
    "lon": 195005,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 404,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 181891, 195305 181691, 195105 181691, 195105 181891, 195305 181891)))",
    "lon": 195205,
    "lat": 181791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 405,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 182091, 190105 181891, 189905 181891, 189905 182091, 190105 182091)))",
    "lon": 190005,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 406,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 182091, 190305 181891, 190105 181891, 190105 182091, 190305 182091)))",
    "lon": 190205,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 407,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 182091, 190505 181891, 190305 181891, 190305 182091, 190505 182091)))",
    "lon": 190405,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 408,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 182091, 190705 181891, 190505 181891, 190505 182091, 190705 182091)))",
    "lon": 190605,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 409,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 182091, 190905 181891, 190705 181891, 190705 182091, 190905 182091)))",
    "lon": 190805,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 410,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 182091, 191105 181891, 190905 181891, 190905 182091, 191105 182091)))",
    "lon": 191005,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 411,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 182091, 191305 181891, 191105 181891, 191105 182091, 191305 182091)))",
    "lon": 191205,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 472.4924319,
    "Park_pc": 1.18096741,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00007,
    "id": 412,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 182091, 191505 181891, 191305 181891, 191305 182091, 191505 182091)))",
    "lon": 191405,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11814.95489,
    "House_pc": 29.53079148,
    "Park_area": 16885.21922,
    "Park_pc": 42.20362181,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00163,
    "Park_PCT": 0.00234,
    "id": 413,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 182091, 191705 181891, 191505 181891, 191505 182091, 191705 182091)))",
    "lon": 191605,
    "lat": 181991,
    "Commercial": 6546.681601,
    "Commerci_1": 16.36304792,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11162.6734,
    "House_pc": 27.90044954,
    "Park_area": 3162.605309,
    "Park_pc": 7.904747073,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00091,
    "House_PCT": 0.00154,
    "Park_PCT": 0.00044,
    "id": 414,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 182091, 191905 181891, 191705 181891, 191705 182091, 191905 182091)))",
    "lon": 191805,
    "lat": 181991,
    "Commercial": 20253.08709,
    "Commerci_1": 50.62140297,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 354.6745238,
    "House_pc": 0.886488164,
    "Park_area": 7676.397178,
    "Park_pc": 19.18670439,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.0028,
    "House_PCT": 0.00005,
    "Park_PCT": 0.00106,
    "id": 415,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 182091, 192105 181891, 191905 181891, 191905 182091, 192105 182091)))",
    "lon": 192005,
    "lat": 181991,
    "Commercial": 19444.61633,
    "Commerci_1": 48.60067386,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9247.40933,
    "Park_pc": 23.11335525,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00269,
    "House_PCT": 0,
    "Park_PCT": 0.00128,
    "id": 416,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 182091, 192305 181891, 192105 181891, 192105 182091, 192305 182091)))",
    "lon": 192205,
    "lat": 181991,
    "Commercial": 12136.25767,
    "Commerci_1": 30.33385925,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 14973.32368,
    "Park_pc": 37.42493819,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00168,
    "House_PCT": 0,
    "Park_PCT": 0.00207,
    "id": 417,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 182091, 192505 181891, 192305 181891, 192305 182091, 192505 182091)))",
    "lon": 192405,
    "lat": 181991,
    "Commercial": 718.2316498,
    "Commerci_1": 1.795177452,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 4487.485043,
    "House_pc": 11.21620297,
    "Park_area": 29145.13044,
    "Park_pc": 72.84652663,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.0001,
    "House_PCT": 0.00062,
    "Park_PCT": 0.00403,
    "id": 418,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 182091, 192705 181891, 192505 181891, 192505 182091, 192705 182091)))",
    "lon": 192605,
    "lat": 181991,
    "Commercial": 650.1190087,
    "Commerci_1": 1.624933821,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 21.80252079,
    "House_pc": 0.054494105,
    "Park_area": 11367.94521,
    "Park_pc": 28.41350337,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00009,
    "House_PCT": 0,
    "Park_PCT": 0.00157,
    "id": 419,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 182091, 192905 181891, 192705 181891, 192705 182091, 192905 182091)))",
    "lon": 192805,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 122.9440562,
    "House_pc": 0.307291339,
    "Park_area": 15107.59206,
    "Park_pc": 37.76052571,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00002,
    "Park_PCT": 0.00209,
    "id": 420,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 182091, 193105 181891, 192905 181891, 192905 182091, 193105 182091)))",
    "lon": 193005,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 20828.6585,
    "House_pc": 52.05998655,
    "Park_area": 3995.732871,
    "Park_pc": 9.987095402,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00288,
    "Park_PCT": 0.00055,
    "id": 421,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 182091, 193305 181891, 193105 181891, 193105 182091, 193305 182091)))",
    "lon": 193205,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19364.05626,
    "House_pc": 48.39929754,
    "Park_area": 41.50809659,
    "Park_pc": 0.103746999,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00268,
    "Park_PCT": 0.00001,
    "id": 422,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 182091, 193505 181891, 193305 181891, 193305 182091, 193505 182091)))",
    "lon": 193405,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19601.66309,
    "House_pc": 48.99317833,
    "Park_area": 7759.282534,
    "Park_pc": 19.39386016,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00271,
    "Park_PCT": 0.00107,
    "id": 423,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 182091, 193705 181891, 193505 181891, 193505 182091, 193705 182091)))",
    "lon": 193605,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 424,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 182091, 193905 181891, 193705 181891, 193705 182091, 193905 182091)))",
    "lon": 193805,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 425,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 182091, 194105 181891, 193905 181891, 193905 182091, 194105 182091)))",
    "lon": 194005,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 426,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 182091, 194305 181891, 194105 181891, 194105 182091, 194305 182091)))",
    "lon": 194205,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 427,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 182091, 194505 181891, 194305 181891, 194305 182091, 194505 182091)))",
    "lon": 194405,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 428,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 182091, 194705 181891, 194505 181891, 194505 182091, 194705 182091)))",
    "lon": 194605,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 429,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 182091, 194905 181891, 194705 181891, 194705 182091, 194905 182091)))",
    "lon": 194805,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 430,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 182091, 195105 181891, 194905 181891, 194905 182091, 195105 182091)))",
    "lon": 195005,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 431,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 182091, 195305 181891, 195105 181891, 195105 182091, 195305 182091)))",
    "lon": 195205,
    "lat": 181991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 432,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 182291, 190105 182091, 189905 182091, 189905 182291, 190105 182291)))",
    "lon": 190005,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 433,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 182291, 190305 182091, 190105 182091, 190105 182291, 190305 182291)))",
    "lon": 190205,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 434,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 182291, 190505 182091, 190305 182091, 190305 182291, 190505 182291)))",
    "lon": 190405,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 435,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 182291, 190705 182091, 190505 182091, 190505 182291, 190705 182291)))",
    "lon": 190605,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 436,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 182291, 190905 182091, 190705 182091, 190705 182291, 190905 182291)))",
    "lon": 190805,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 437,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 182291, 191105 182091, 190905 182091, 190905 182291, 191105 182291)))",
    "lon": 191005,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 438,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 182291, 191305 182091, 191105 182091, 191105 182291, 191305 182291)))",
    "lon": 191205,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 4714.371528,
    "Park_pc": 11.783298,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00065,
    "id": 439,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 182291, 191505 182091, 191305 182091, 191305 182291, 191505 182291)))",
    "lon": 191405,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19799.78977,
    "House_pc": 49.48842105,
    "Park_area": 12036.61442,
    "Park_pc": 30.08481652,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00274,
    "Park_PCT": 0.00166,
    "id": 440,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 182291, 191705 182091, 191505 182091, 191505 182291, 191705 182291)))",
    "lon": 191605,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 9799.944333,
    "Govermen_1": 24.49438789,
    "House_area": 16708.26653,
    "House_pc": 41.76133532,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00136,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00231,
    "Park_PCT": 0,
    "id": 441,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 182291, 191905 182091, 191705 182091, 191705 182291, 191905 182291)))",
    "lon": 191805,
    "lat": 182191,
    "Commercial": 13735.21329,
    "Commerci_1": 34.33035977,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 8450.943483,
    "Govermen_1": 21.12263741,
    "House_area": 2129.53788,
    "House_pc": 5.322654989,
    "Park_area": 1714.028201,
    "Park_pc": 4.284112925,
    "Govern_PCT": 0.00117,
    "Factory__1": 0,
    "Commerc_PC": 0.0019,
    "House_PCT": 0.00029,
    "Park_PCT": 0.00024,
    "id": 442,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 182291, 192105 182091, 191905 182091, 191905 182291, 192105 182291)))",
    "lon": 192005,
    "lat": 182191,
    "Commercial": 22366.60958,
    "Commerci_1": 55.90402392,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 4187.266082,
    "Park_pc": 10.46582507,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00309,
    "House_PCT": 0,
    "Park_PCT": 0.00058,
    "id": 443,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 182291, 192305 182091, 192105 182091, 192105 182291, 192305 182291)))",
    "lon": 192205,
    "lat": 182191,
    "Commercial": 6069.973462,
    "Commerci_1": 15.17154015,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 9150.251748,
    "House_pc": 22.87051378,
    "Park_area": 13237.789,
    "Park_pc": 33.0870717,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00084,
    "House_PCT": 0.00127,
    "Park_PCT": 0.00183,
    "id": 444,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 182291, 192505 182091, 192305 182091, 192305 182291, 192505 182291)))",
    "lon": 192405,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 33240.61257,
    "House_pc": 83.08294145,
    "Park_area": 975.4070657,
    "Park_pc": 2.437972163,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0046,
    "Park_PCT": 0.00013,
    "id": 445,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 182291, 192705 182091, 192505 182091, 192505 182291, 192705 182291)))",
    "lon": 192605,
    "lat": 182191,
    "Commercial": 2351.929638,
    "Commerci_1": 5.878508334,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 7524.000936,
    "House_pc": 18.80579312,
    "Park_area": 12010.49078,
    "Park_pc": 30.0195078,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00033,
    "House_PCT": 0.00104,
    "Park_PCT": 0.00166,
    "id": 446,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 182291, 192905 182091, 192705 182091, 192705 182291, 192905 182291)))",
    "lon": 192805,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1176.171519,
    "House_pc": 2.939770591,
    "Park_area": 3365.171445,
    "Park_pc": 8.411045399,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00016,
    "Park_PCT": 0.00047,
    "id": 447,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 182291, 193105 182091, 192905 182091, 192905 182291, 193105 182291)))",
    "lon": 193005,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 4141.204982,
    "House_pc": 10.35069423,
    "Park_area": 10875.54137,
    "Park_pc": 27.18276535,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00057,
    "Park_PCT": 0.0015,
    "id": 448,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 182291, 193305 182091, 193105 182091, 193105 182291, 193305 182291)))",
    "lon": 193205,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 27107.98457,
    "House_pc": 67.75478195,
    "Park_area": 1114.070118,
    "Park_pc": 2.784551456,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00375,
    "Park_PCT": 0.00015,
    "id": 449,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 182291, 193505 182091, 193305 182091, 193305 182291, 193505 182291)))",
    "lon": 193405,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 10907.18632,
    "House_pc": 27.26185637,
    "Park_area": 3895.382636,
    "Park_pc": 9.736274675,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00151,
    "Park_PCT": 0.00054,
    "id": 450,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 182291, 193705 182091, 193505 182091, 193505 182291, 193705 182291)))",
    "lon": 193605,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 2244.727955,
    "Park_pc": 5.610562192,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00031,
    "id": 451,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 182291, 193905 182091, 193705 182091, 193705 182291, 193905 182291)))",
    "lon": 193805,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 452,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 182291, 194105 182091, 193905 182091, 193905 182291, 194105 182291)))",
    "lon": 194005,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 453,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 182291, 194305 182091, 194105 182091, 194105 182291, 194305 182291)))",
    "lon": 194205,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 454,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 182291, 194505 182091, 194305 182091, 194305 182291, 194505 182291)))",
    "lon": 194405,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 455,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 182291, 194705 182091, 194505 182091, 194505 182291, 194705 182291)))",
    "lon": 194605,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 456,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 182291, 194905 182091, 194705 182091, 194705 182291, 194905 182291)))",
    "lon": 194805,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 457,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 182291, 195105 182091, 194905 182091, 194905 182291, 195105 182291)))",
    "lon": 195005,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 458,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 182291, 195305 182091, 195105 182091, 195105 182291, 195305 182291)))",
    "lon": 195205,
    "lat": 182191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 459,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 182491, 190105 182291, 189905 182291, 189905 182491, 190105 182491)))",
    "lon": 190005,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 460,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 182491, 190305 182291, 190105 182291, 190105 182491, 190305 182491)))",
    "lon": 190205,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 461,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 182491, 190505 182291, 190305 182291, 190305 182491, 190505 182491)))",
    "lon": 190405,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 462,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 182491, 190705 182291, 190505 182291, 190505 182491, 190705 182491)))",
    "lon": 190605,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 463,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 182491, 190905 182291, 190705 182291, 190705 182491, 190905 182491)))",
    "lon": 190805,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 464,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 182491, 191105 182291, 190905 182291, 190905 182491, 191105 182491)))",
    "lon": 191005,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 465,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 182491, 191305 182291, 191105 182291, 191105 182491, 191305 182491)))",
    "lon": 191205,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6789.274811,
    "Park_pc": 16.9693983,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00094,
    "id": 466,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 182491, 191505 182291, 191305 182291, 191305 182491, 191505 182491)))",
    "lon": 191405,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 18664.43864,
    "House_pc": 46.65067699,
    "Park_area": 6800.638315,
    "Park_pc": 16.99779926,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00258,
    "Park_PCT": 0.00094,
    "id": 467,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 182491, 191705 182291, 191505 182291, 191505 182491, 191705 182491)))",
    "lon": 191605,
    "lat": 182391,
    "Commercial": 10076.01188,
    "Commerci_1": 25.18440254,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 2110.70214,
    "Govermen_1": 5.275576587,
    "House_area": 10821.69076,
    "House_pc": 27.04818332,
    "Park_area": 1260.993747,
    "Park_pc": 3.151780141,
    "Govern_PCT": 0.00029,
    "Factory__1": 0,
    "Commerc_PC": 0.00139,
    "House_PCT": 0.0015,
    "Park_PCT": 0.00017,
    "id": 468,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 182491, 191905 182291, 191705 182291, 191705 182491, 191905 182491)))",
    "lon": 191805,
    "lat": 182391,
    "Commercial": 14938.01638,
    "Commerci_1": 37.33669546,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 11424.84994,
    "Govermen_1": 28.55574209,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 5163.228404,
    "Park_pc": 12.90518645,
    "Govern_PCT": 0.00158,
    "Factory__1": 0,
    "Commerc_PC": 0.00207,
    "House_PCT": 0,
    "Park_PCT": 0.00071,
    "id": 469,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 182491, 192105 182291, 191905 182291, 191905 182491, 192105 182491)))",
    "lon": 192005,
    "lat": 182391,
    "Commercial": 5716.26233,
    "Commerci_1": 14.28746116,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 9848.954314,
    "Govermen_1": 24.61688147,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9345.614635,
    "Park_pc": 23.35881357,
    "Govern_PCT": 0.00136,
    "Factory__1": 0,
    "Commerc_PC": 0.00079,
    "House_PCT": 0,
    "Park_PCT": 0.00129,
    "id": 470,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 182491, 192305 182291, 192105 182291, 192105 182491, 192305 182491)))",
    "lon": 192205,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 18937.73843,
    "House_pc": 47.33375858,
    "Park_area": 3616.724857,
    "Park_pc": 9.039790148,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00262,
    "Park_PCT": 0.0005,
    "id": 471,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 182491, 192505 182291, 192305 182291, 192305 182491, 192505 182491)))",
    "lon": 192405,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 18461.84513,
    "House_pc": 46.1442879,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00255,
    "Park_PCT": 0,
    "id": 472,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 182491, 192705 182291, 192505 182291, 192505 182491, 192705 182491)))",
    "lon": 192605,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 22651.71544,
    "House_pc": 56.61661627,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00313,
    "Park_PCT": 0,
    "id": 473,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 182491, 192905 182291, 192705 182291, 192705 182491, 192905 182491)))",
    "lon": 192805,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11929.92459,
    "House_pc": 29.81813523,
    "Park_area": 7663.291487,
    "Park_pc": 19.15394017,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00165,
    "Park_PCT": 0.00106,
    "id": 474,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 182491, 193105 182291, 192905 182291, 192905 182491, 193105 182491)))",
    "lon": 193005,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 4064.379922,
    "House_pc": 10.15867458,
    "Park_area": 6338.382891,
    "Park_pc": 15.84240902,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00056,
    "Park_PCT": 0.00088,
    "id": 475,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 182491, 193305 182291, 193105 182291, 193105 182491, 193305 182491)))",
    "lon": 193205,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 26064.90107,
    "House_pc": 65.14765719,
    "Park_area": 1279.781378,
    "Park_pc": 3.19873681,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00361,
    "Park_PCT": 0.00018,
    "id": 476,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 182491, 193505 182291, 193305 182291, 193305 182491, 193505 182491)))",
    "lon": 193405,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 27447.95022,
    "House_pc": 68.60450109,
    "Park_area": 768.6649936,
    "Park_pc": 1.92123193,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0038,
    "Park_PCT": 0.00011,
    "id": 477,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 182491, 193705 182291, 193505 182291, 193505 182491, 193705 182491)))",
    "lon": 193605,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 5038.897824,
    "Park_pc": 12.59442131,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.0007,
    "id": 478,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 182491, 193905 182291, 193705 182291, 193705 182491, 193905 182491)))",
    "lon": 193805,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 479,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 182491, 194105 182291, 193905 182291, 193905 182491, 194105 182491)))",
    "lon": 194005,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 480,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 182491, 194305 182291, 194105 182291, 194105 182491, 194305 182491)))",
    "lon": 194205,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 481,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 182491, 194505 182291, 194305 182291, 194305 182491, 194505 182491)))",
    "lon": 194405,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 482,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 182491, 194705 182291, 194505 182291, 194505 182491, 194705 182491)))",
    "lon": 194605,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 483,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 182491, 194905 182291, 194705 182291, 194705 182491, 194905 182491)))",
    "lon": 194805,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 484,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 182491, 195105 182291, 194905 182291, 194905 182491, 195105 182491)))",
    "lon": 195005,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 485,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 182491, 195305 182291, 195105 182291, 195105 182491, 195305 182491)))",
    "lon": 195205,
    "lat": 182391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 486,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 182691, 190105 182491, 189905 182491, 189905 182691, 190105 182691)))",
    "lon": 190005,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 487,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 182691, 190305 182491, 190105 182491, 190105 182691, 190305 182691)))",
    "lon": 190205,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 488,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 182691, 190505 182491, 190305 182491, 190305 182691, 190505 182691)))",
    "lon": 190405,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 489,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 182691, 190705 182491, 190505 182491, 190505 182691, 190705 182691)))",
    "lon": 190605,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 490,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 182691, 190905 182491, 190705 182491, 190705 182691, 190905 182691)))",
    "lon": 190805,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 491,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 182691, 191105 182491, 190905 182491, 190905 182691, 191105 182691)))",
    "lon": 191005,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 492,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 182691, 191305 182491, 191105 182491, 191105 182691, 191305 182691)))",
    "lon": 191205,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 8597.33277,
    "Park_pc": 21.48853419,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00119,
    "id": 493,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 182691, 191505 182491, 191305 182491, 191305 182691, 191505 182691)))",
    "lon": 191405,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 5040.691483,
    "House_pc": 12.59891468,
    "Park_area": 480.9546303,
    "Park_pc": 1.202118076,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0007,
    "Park_PCT": 0.00007,
    "id": 494,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 182691, 191705 182491, 191505 182491, 191505 182691, 191705 182691)))",
    "lon": 191605,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 8241.485874,
    "Govermen_1": 20.59911204,
    "House_area": 1605.193031,
    "House_pc": 4.012086122,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00114,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00022,
    "Park_PCT": 0,
    "id": 495,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 182691, 191905 182491, 191705 182491, 191705 182691, 191905 182691)))",
    "lon": 191805,
    "lat": 182591,
    "Commercial": 455.6052429,
    "Commerci_1": 1.138758571,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 3953.12844,
    "Govermen_1": 9.880612578,
    "House_area": 20749.27999,
    "House_pc": 51.86160782,
    "Park_area": 3530.561246,
    "Park_pc": 8.824430673,
    "Govern_PCT": 0.00055,
    "Factory__1": 0,
    "Commerc_PC": 0.00006,
    "House_PCT": 0.00287,
    "Park_PCT": 0.00049,
    "id": 496,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 182691, 192105 182491, 191905 182491, 191905 182691, 192105 182691)))",
    "lon": 192005,
    "lat": 182591,
    "Commercial": 46.25205204,
    "Commerci_1": 0.115604281,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 5179.121856,
    "House_pc": 12.94491015,
    "Park_area": 24587.82954,
    "Park_pc": 61.45583228,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00001,
    "House_PCT": 0.00072,
    "Park_PCT": 0.0034,
    "id": 497,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 182691, 192305 182491, 192105 182491, 192105 182691, 192305 182691)))",
    "lon": 192205,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 35612.1562,
    "House_pc": 89.01048078,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00493,
    "Park_PCT": 0,
    "id": 498,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 182691, 192505 182491, 192305 182491, 192305 182691, 192505 182691)))",
    "lon": 192405,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 7779.5802,
    "House_pc": 19.44459969,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00108,
    "Park_PCT": 0,
    "id": 499,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 182691, 192705 182491, 192505 182491, 192505 182691, 192705 182691)))",
    "lon": 192605,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 32573.0668,
    "House_pc": 81.41444415,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00451,
    "Park_PCT": 0,
    "id": 500,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 182691, 192905 182491, 192705 182491, 192705 182691, 192905 182691)))",
    "lon": 192805,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 18102.8121,
    "House_pc": 45.24689947,
    "Park_area": 111.7825058,
    "Park_pc": 0.279393708,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0025,
    "Park_PCT": 0.00002,
    "id": 501,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 182691, 193105 182491, 192905 182491, 192905 182691, 193105 182691)))",
    "lon": 193005,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 2617.844546,
    "House_pc": 6.543145896,
    "Park_area": 9134.609849,
    "Park_pc": 22.83141107,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00036,
    "Park_PCT": 0.00126,
    "id": 502,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 182691, 193305 182491, 193105 182491, 193105 182691, 193305 182691)))",
    "lon": 193205,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11645.91778,
    "House_pc": 29.10827308,
    "Park_area": 5800.601942,
    "Park_pc": 14.49825669,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00161,
    "Park_PCT": 0.0008,
    "id": 503,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 182691, 193505 182491, 193305 182491, 193305 182691, 193505 182691)))",
    "lon": 193405,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 31568.19198,
    "House_pc": 78.90279752,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00437,
    "Park_PCT": 0,
    "id": 504,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 182691, 193705 182491, 193505 182491, 193505 182691, 193705 182691)))",
    "lon": 193605,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 814.4557996,
    "House_pc": 2.035683164,
    "Park_area": 2078.849473,
    "Park_pc": 5.195958913,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00011,
    "Park_PCT": 0.00029,
    "id": 505,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 182691, 193905 182491, 193705 182491, 193705 182691, 193905 182691)))",
    "lon": 193805,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 506,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 182691, 194105 182491, 193905 182491, 193905 182691, 194105 182691)))",
    "lon": 194005,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 507,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 182691, 194305 182491, 194105 182491, 194105 182691, 194305 182691)))",
    "lon": 194205,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 508,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 182691, 194505 182491, 194305 182491, 194305 182691, 194505 182691)))",
    "lon": 194405,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 509,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 182691, 194705 182491, 194505 182491, 194505 182691, 194705 182691)))",
    "lon": 194605,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 510,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 182691, 194905 182491, 194705 182491, 194705 182691, 194905 182691)))",
    "lon": 194805,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 511,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 182691, 195105 182491, 194905 182491, 194905 182691, 195105 182691)))",
    "lon": 195005,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 512,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 182691, 195305 182491, 195105 182491, 195105 182691, 195305 182691)))",
    "lon": 195205,
    "lat": 182591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 513,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 182891, 190105 182691, 189905 182691, 189905 182891, 190105 182891)))",
    "lon": 190005,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 514,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 182891, 190305 182691, 190105 182691, 190105 182891, 190305 182891)))",
    "lon": 190205,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 515,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 182891, 190505 182691, 190305 182691, 190305 182891, 190505 182891)))",
    "lon": 190405,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 516,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 182891, 190705 182691, 190505 182691, 190505 182891, 190705 182891)))",
    "lon": 190605,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 517,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 182891, 190905 182691, 190705 182691, 190705 182891, 190905 182891)))",
    "lon": 190805,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 518,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 182891, 191105 182691, 190905 182691, 190905 182891, 191105 182891)))",
    "lon": 191005,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 519,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 182891, 191305 182691, 191105 182691, 191105 182891, 191305 182891)))",
    "lon": 191205,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1205.078196,
    "House_pc": 3.012022993,
    "Park_area": 7124.919377,
    "Park_pc": 17.80832237,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00017,
    "Park_PCT": 0.00099,
    "id": 520,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 182891, 191505 182691, 191305 182691, 191305 182891, 191505 182891)))",
    "lon": 191405,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11803.4797,
    "House_pc": 29.50210976,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00163,
    "Park_PCT": 0,
    "id": 521,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 182891, 191705 182691, 191505 182691, 191505 182891, 191705 182891)))",
    "lon": 191605,
    "lat": 182791,
    "Commercial": 5786.397015,
    "Commerci_1": 14.46276098,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 54.4178094,
    "Govermen_1": 0.136014132,
    "House_area": 5809.397703,
    "House_pc": 14.52024985,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00001,
    "Factory__1": 0,
    "Commerc_PC": 0.0008,
    "House_PCT": 0.0008,
    "Park_PCT": 0,
    "id": 522,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 182891, 191905 182691, 191705 182691, 191705 182891, 191905 182891)))",
    "lon": 191805,
    "lat": 182791,
    "Commercial": 22732.94526,
    "Commerci_1": 56.8196627,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 2102.772052,
    "Govermen_1": 5.255755354,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 3941.340026,
    "Park_pc": 9.851148117,
    "Govern_PCT": 0.00029,
    "Factory__1": 0,
    "Commerc_PC": 0.00314,
    "House_PCT": 0,
    "Park_PCT": 0.00055,
    "id": 523,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 182891, 192105 182691, 191905 182691, 191905 182891, 192105 182891)))",
    "lon": 192005,
    "lat": 182791,
    "Commercial": 1427.202989,
    "Commerci_1": 3.567209838,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 375.4973061,
    "Govermen_1": 0.938533408,
    "House_area": 873.7201135,
    "House_pc": 2.18381198,
    "Park_area": 31011.70903,
    "Park_pc": 77.51194076,
    "Govern_PCT": 0.00005,
    "Factory__1": 0,
    "Commerc_PC": 0.0002,
    "House_PCT": 0.00012,
    "Park_PCT": 0.00429,
    "id": 524,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 182891, 192305 182691, 192105 182691, 192105 182891, 192305 182891)))",
    "lon": 192205,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 35043.96275,
    "House_pc": 87.59031472,
    "Park_area": 21.87198973,
    "Park_pc": 0.054667746,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00485,
    "Park_PCT": 0,
    "id": 525,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 182891, 192505 182691, 192305 182691, 192305 182891, 192505 182891)))",
    "lon": 192405,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 23495.27749,
    "House_pc": 58.72505367,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00325,
    "Park_PCT": 0,
    "id": 526,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 182891, 192705 182691, 192505 182691, 192505 182891, 192705 182891)))",
    "lon": 192605,
    "lat": 182791,
    "Commercial": 1551.921021,
    "Commerci_1": 3.878934334,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 33238.9387,
    "House_pc": 83.07875129,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00021,
    "House_PCT": 0.0046,
    "Park_PCT": 0,
    "id": 527,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 182891, 192905 182691, 192705 182691, 192705 182891, 192905 182891)))",
    "lon": 192805,
    "lat": 182791,
    "Commercial": 1523.163304,
    "Commerci_1": 3.807055856,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11198.96292,
    "House_pc": 27.99114004,
    "Park_area": 6683.381001,
    "Park_pc": 16.7047123,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00021,
    "House_PCT": 0.00155,
    "Park_PCT": 0.00092,
    "id": 528,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 182891, 193105 182691, 192905 182691, 192905 182891, 193105 182891)))",
    "lon": 193005,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 9805.707083,
    "House_pc": 24.50877845,
    "Park_area": 14578.90129,
    "Park_pc": 36.43909191,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00136,
    "Park_PCT": 0.00202,
    "id": 529,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 182891, 193305 182691, 193105 182691, 193105 182891, 193305 182891)))",
    "lon": 193205,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 903.5656445,
    "House_pc": 2.258408139,
    "Park_area": 10751.14424,
    "Park_pc": 26.87184026,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00012,
    "Park_PCT": 0.00149,
    "id": 530,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 182891, 193505 182691, 193305 182691, 193305 182891, 193505 182891)))",
    "lon": 193405,
    "lat": 182791,
    "Commercial": 3628.551391,
    "Commerci_1": 9.06934599,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 6959.994959,
    "House_pc": 17.39608884,
    "Park_area": 12125.72183,
    "Park_pc": 30.30751251,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.0005,
    "House_PCT": 0.00096,
    "Park_PCT": 0.00168,
    "id": 531,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 182891, 193705 182691, 193505 182691, 193505 182891, 193705 182891)))",
    "lon": 193605,
    "lat": 182791,
    "Commercial": 3493.308138,
    "Commerci_1": 8.731313053,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1238.523981,
    "House_pc": 3.095616011,
    "Park_area": 3727.350801,
    "Park_pc": 9.316288576,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00048,
    "House_PCT": 0.00017,
    "Park_PCT": 0.00052,
    "id": 532,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 182891, 193905 182691, 193705 182691, 193705 182891, 193905 182891)))",
    "lon": 193805,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 533,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 182891, 194105 182691, 193905 182691, 193905 182891, 194105 182891)))",
    "lon": 194005,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 534,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 182891, 194305 182691, 194105 182691, 194105 182891, 194305 182891)))",
    "lon": 194205,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 535,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 182891, 194505 182691, 194305 182691, 194305 182891, 194505 182891)))",
    "lon": 194405,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 536,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 182891, 194705 182691, 194505 182691, 194505 182891, 194705 182891)))",
    "lon": 194605,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 537,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 182891, 194905 182691, 194705 182691, 194705 182891, 194905 182891)))",
    "lon": 194805,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 538,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 182891, 195105 182691, 194905 182691, 194905 182891, 195105 182891)))",
    "lon": 195005,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 539,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 182891, 195305 182691, 195105 182691, 195105 182891, 195305 182891)))",
    "lon": 195205,
    "lat": 182791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 540,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 183091, 190105 182891, 189905 182891, 189905 183091, 190105 183091)))",
    "lon": 190005,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 541,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 183091, 190305 182891, 190105 182891, 190105 183091, 190305 183091)))",
    "lon": 190205,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 542,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 183091, 190505 182891, 190305 182891, 190305 183091, 190505 183091)))",
    "lon": 190405,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 543,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 183091, 190705 182891, 190505 182891, 190505 183091, 190705 183091)))",
    "lon": 190605,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 544,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 183091, 190905 182891, 190705 182891, 190705 183091, 190905 183091)))",
    "lon": 190805,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 545,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 183091, 191105 182891, 190905 182891, 190905 183091, 191105 183091)))",
    "lon": 191005,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 546,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 183091, 191305 182891, 191105 182891, 191105 183091, 191305 183091)))",
    "lon": 191205,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 6064.395507,
    "House_pc": 15.1576045,
    "Park_area": 15784.24949,
    "Park_pc": 39.45181524,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00084,
    "Park_PCT": 0.00218,
    "id": 547,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 183091, 191505 182891, 191305 182891, 191305 183091, 191505 183091)))",
    "lon": 191405,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 40008.9343,
    "House_pc": 100,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00553,
    "Park_PCT": 0,
    "id": 548,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 183091, 191705 182891, 191505 182891, 191505 183091, 191705 183091)))",
    "lon": 191605,
    "lat": 182991,
    "Commercial": 1486.379591,
    "Commerci_1": 3.715118865,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 4582.006771,
    "Govermen_1": 11.45245797,
    "House_area": 18975.61994,
    "House_pc": 47.42845236,
    "Park_area": 1480.234576,
    "Park_pc": 3.69975976,
    "Govern_PCT": 0.00063,
    "Factory__1": 0,
    "Commerc_PC": 0.00021,
    "House_PCT": 0.00262,
    "Park_PCT": 0.0002,
    "id": 549,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 183091, 191905 182891, 191705 182891, 191705 183091, 191905 183091)))",
    "lon": 191805,
    "lat": 182991,
    "Commercial": 7934.417601,
    "Commerci_1": 19.83161118,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 16275.53523,
    "Govermen_1": 40.67974521,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9545.566863,
    "Park_pc": 23.85858421,
    "Govern_PCT": 0.00225,
    "Factory__1": 0,
    "Commerc_PC": 0.0011,
    "House_PCT": 0,
    "Park_PCT": 0.00132,
    "id": 550,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 183091, 192105 182891, 191905 182891, 191905 183091, 192105 183091)))",
    "lon": 192005,
    "lat": 182991,
    "Commercial": 1328.575587,
    "Commerci_1": 3.320696449,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 1728.589817,
    "Govermen_1": 4.320508464,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 32318.54756,
    "Park_pc": 80.77830662,
    "Govern_PCT": 0.00024,
    "Factory__1": 0,
    "Commerc_PC": 0.00018,
    "House_PCT": 0,
    "Park_PCT": 0.00447,
    "id": 551,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 183091, 192305 182891, 192105 182891, 192105 183091, 192305 183091)))",
    "lon": 192205,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 30712.87549,
    "House_pc": 76.76501787,
    "Park_area": 2981.36319,
    "Park_pc": 7.451741164,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00425,
    "Park_PCT": 0.00041,
    "id": 552,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 183091, 192505 182891, 192305 182891, 192305 183091, 192505 183091)))",
    "lon": 192405,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 16475.96339,
    "House_pc": 41.18069402,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00228,
    "Park_PCT": 0,
    "id": 553,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 183091, 192705 182891, 192505 182891, 192505 183091, 192705 183091)))",
    "lon": 192605,
    "lat": 182991,
    "Commercial": 3568.324548,
    "Commerci_1": 8.918815066,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 25583.7809,
    "House_pc": 63.94513937,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00049,
    "House_PCT": 0.00354,
    "Park_PCT": 0,
    "id": 554,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 183091, 192905 182891, 192705 182891, 192705 183091, 192905 183091)))",
    "lon": 192805,
    "lat": 182991,
    "Commercial": 3090.20634,
    "Commerci_1": 7.723786475,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11773.21459,
    "House_pc": 29.42644783,
    "Park_area": 16366.27112,
    "Park_pc": 40.90651873,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00043,
    "House_PCT": 0.00163,
    "Park_PCT": 0.00226,
    "id": 555,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 183091, 193105 182891, 192905 182891, 192905 183091, 193105 183091)))",
    "lon": 193005,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11153.75219,
    "House_pc": 27.87813654,
    "Park_area": 22765.51783,
    "Park_pc": 56.9010503,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00154,
    "Park_PCT": 0.00315,
    "id": 556,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 183091, 193305 182891, 193105 182891, 193105 183091, 193305 183091)))",
    "lon": 193205,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9599.764246,
    "Park_pc": 23.99403498,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00133,
    "id": 557,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 183091, 193505 182891, 193305 182891, 193305 183091, 193505 183091)))",
    "lon": 193405,
    "lat": 182991,
    "Commercial": 18576.82364,
    "Commerci_1": 46.43165347,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 13695.03111,
    "Park_pc": 34.22990663,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00257,
    "House_PCT": 0,
    "Park_PCT": 0.00189,
    "id": 558,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 183091, 193705 182891, 193505 182891, 193505 183091, 193705 183091)))",
    "lon": 193605,
    "lat": 182991,
    "Commercial": 14557.18227,
    "Commerci_1": 36.38479928,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6778.482679,
    "Park_pc": 16.94240871,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00201,
    "House_PCT": 0,
    "Park_PCT": 0.00094,
    "id": 559,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 183091, 193905 182891, 193705 182891, 193705 183091, 193905 183091)))",
    "lon": 193805,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 397.2165955,
    "Park_pc": 0.992818866,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00005,
    "id": 560,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 183091, 194105 182891, 193905 182891, 193905 183091, 194105 183091)))",
    "lon": 194005,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 561,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 183091, 194305 182891, 194105 182891, 194105 183091, 194305 183091)))",
    "lon": 194205,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 562,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 183091, 194505 182891, 194305 182891, 194305 183091, 194505 183091)))",
    "lon": 194405,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 563,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 183091, 194705 182891, 194505 182891, 194505 183091, 194705 183091)))",
    "lon": 194605,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 564,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 183091, 194905 182891, 194705 182891, 194705 183091, 194905 183091)))",
    "lon": 194805,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 565,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 183091, 195105 182891, 194905 182891, 194905 183091, 195105 183091)))",
    "lon": 195005,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 566,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 183091, 195305 182891, 195105 182891, 195105 183091, 195305 183091)))",
    "lon": 195205,
    "lat": 182991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 567,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 183291, 190105 183091, 189905 183091, 189905 183291, 190105 183291)))",
    "lon": 190005,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 568,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 183291, 190305 183091, 190105 183091, 190105 183291, 190305 183291)))",
    "lon": 190205,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 569,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 183291, 190505 183091, 190305 183091, 190305 183291, 190505 183291)))",
    "lon": 190405,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 570,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 183291, 190705 183091, 190505 183091, 190505 183291, 190705 183291)))",
    "lon": 190605,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 571,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 183291, 190905 183091, 190705 183091, 190705 183291, 190905 183291)))",
    "lon": 190805,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 572,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 183291, 191105 183091, 190905 183091, 190905 183291, 191105 183291)))",
    "lon": 191005,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 573,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 183291, 191305 183091, 191105 183091, 191105 183291, 191305 183291)))",
    "lon": 191205,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 5232.720248,
    "House_pc": 13.07888046,
    "Park_area": 16655.0898,
    "Park_pc": 41.62842999,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00072,
    "Park_PCT": 0.0023,
    "id": 574,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 183291, 191505 183091, 191305 183091, 191305 183291, 191505 183291)))",
    "lon": 191405,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 31579.69615,
    "House_pc": 78.9316103,
    "Park_area": 1989.197265,
    "Park_pc": 4.971882648,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00437,
    "Park_PCT": 0.00028,
    "id": 575,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 183291, 191705 183091, 191505 183091, 191505 183291, 191705 183291)))",
    "lon": 191605,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 4140.851528,
    "Govermen_1": 10.34981623,
    "House_area": 15830.62159,
    "House_pc": 39.56771285,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.00057,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00219,
    "Park_PCT": 0,
    "id": 576,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 183291, 191905 183091, 191705 183091, 191705 183291, 191905 183291)))",
    "lon": 191805,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 10121.43096,
    "Govermen_1": 25.2979227,
    "House_area": 1208.404337,
    "House_pc": 3.020335725,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0.0014,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00017,
    "Park_PCT": 0,
    "id": 577,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 183291, 192105 183091, 191905 183091, 191905 183291, 192105 183291)))",
    "lon": 192005,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 269.2245532,
    "House_pc": 0.672910917,
    "Park_area": 23334.95787,
    "Park_pc": 58.32435312,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00004,
    "Park_PCT": 0.00323,
    "id": 578,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 183291, 192305 183091, 192105 183091, 192105 183291, 192305 183291)))",
    "lon": 192205,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 21004.14106,
    "House_pc": 52.49860967,
    "Park_area": 4760.088172,
    "Park_pc": 11.89755916,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00291,
    "Park_PCT": 0.00066,
    "id": 579,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 183291, 192505 183091, 192305 183091, 192305 183291, 192505 183291)))",
    "lon": 192405,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 16513.86144,
    "House_pc": 41.27541791,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00228,
    "Park_PCT": 0,
    "id": 580,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 183291, 192705 183091, 192505 183091, 192505 183291, 192705 183291)))",
    "lon": 192605,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19048.45496,
    "House_pc": 47.61048066,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00263,
    "Park_PCT": 0,
    "id": 581,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 183291, 192905 183091, 192705 183091, 192705 183291, 192905 183291)))",
    "lon": 192805,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19535.13135,
    "House_pc": 48.82689585,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0027,
    "Park_PCT": 0,
    "id": 582,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 183291, 193105 183091, 192905 183091, 192905 183291, 193105 183291)))",
    "lon": 193005,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 20244.24785,
    "House_pc": 50.59928673,
    "Park_area": 5017.691759,
    "Park_pc": 12.54142045,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0028,
    "Park_PCT": 0.00069,
    "id": 583,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 183291, 193305 183091, 193105 183091, 193105 183291, 193305 183291)))",
    "lon": 193205,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 8056.607161,
    "Park_pc": 20.13700637,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00111,
    "id": 584,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 183291, 193505 183091, 193305 183091, 193305 183291, 193505 183291)))",
    "lon": 193405,
    "lat": 183191,
    "Commercial": 32115.89127,
    "Commerci_1": 80.27173866,
    "Factory_ar": 9.320483877,
    "Factory_pc": 0.023295989,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00444,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 585,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 183291, 193705 183091, 193505 183091, 193505 183291, 193705 183291)))",
    "lon": 193605,
    "lat": 183191,
    "Commercial": 11113.52264,
    "Commerci_1": 27.77757967,
    "Factory_ar": 7824.302244,
    "Factory_pc": 19.55637163,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6046.787156,
    "Park_pc": 15.11357985,
    "Govern_PCT": 0,
    "Factory__1": 0.00108,
    "Commerc_PC": 0.00154,
    "House_PCT": 0,
    "Park_PCT": 0.00084,
    "id": 586,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 183291, 193905 183091, 193705 183091, 193705 183291, 193905 183291)))",
    "lon": 193805,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 15077.38363,
    "Park_pc": 37.68500882,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00209,
    "id": 587,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 183291, 194105 183091, 193905 183091, 193905 183291, 194105 183291)))",
    "lon": 194005,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 588,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 183291, 194305 183091, 194105 183091, 194105 183291, 194305 183291)))",
    "lon": 194205,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 589,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 183291, 194505 183091, 194305 183091, 194305 183291, 194505 183291)))",
    "lon": 194405,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 590,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 183291, 194705 183091, 194505 183091, 194505 183291, 194705 183291)))",
    "lon": 194605,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 591,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 183291, 194905 183091, 194705 183091, 194705 183291, 194905 183291)))",
    "lon": 194805,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 592,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 183291, 195105 183091, 194905 183091, 194905 183291, 195105 183291)))",
    "lon": 195005,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 593,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 183291, 195305 183091, 195105 183091, 195105 183291, 195305 183291)))",
    "lon": 195205,
    "lat": 183191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 594,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 183491, 190105 183291, 189905 183291, 189905 183491, 190105 183491)))",
    "lon": 190005,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 595,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 183491, 190305 183291, 190105 183291, 190105 183491, 190305 183491)))",
    "lon": 190205,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 596,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 183491, 190505 183291, 190305 183291, 190305 183491, 190505 183491)))",
    "lon": 190405,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 597,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 183491, 190705 183291, 190505 183291, 190505 183491, 190705 183491)))",
    "lon": 190605,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 598,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 183491, 190905 183291, 190705 183291, 190705 183491, 190905 183491)))",
    "lon": 190805,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 599,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 183491, 191105 183291, 190905 183291, 190905 183491, 191105 183491)))",
    "lon": 191005,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 600,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 183491, 191305 183291, 191105 183291, 191105 183491, 191305 183491)))",
    "lon": 191205,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 3373.688916,
    "House_pc": 8.432339566,
    "Park_area": 15939.70385,
    "Park_pc": 39.84036431,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00047,
    "Park_PCT": 0.0022,
    "id": 601,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 183491, 191505 183291, 191305 183291, 191305 183491, 191505 183491)))",
    "lon": 191405,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 28687.49478,
    "House_pc": 71.70272143,
    "Park_area": 2108.474167,
    "Park_pc": 5.270008308,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00397,
    "Park_PCT": 0.00029,
    "id": 602,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 183491, 191705 183291, 191505 183291, 191505 183491, 191705 183491)))",
    "lon": 191605,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 22453.43711,
    "House_pc": 56.12105288,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00311,
    "Park_PCT": 0,
    "id": 603,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 183491, 191905 183291, 191705 183291, 191705 183491, 191905 183491)))",
    "lon": 191805,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 37986.09598,
    "House_pc": 94.94401755,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00525,
    "Park_PCT": 0,
    "id": 604,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 183491, 192105 183291, 191905 183291, 191905 183491, 192105 183491)))",
    "lon": 192005,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 14869.9279,
    "House_pc": 37.16650913,
    "Park_area": 17865.49419,
    "Park_pc": 44.65375065,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00206,
    "Park_PCT": 0.00247,
    "id": 605,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 183491, 192305 183291, 192105 183291, 192105 183491, 192305 183491)))",
    "lon": 192205,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 36663.05946,
    "House_pc": 91.63715095,
    "Park_area": 1103.861552,
    "Park_pc": 2.759036729,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00507,
    "Park_PCT": 0.00015,
    "id": 606,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 183491, 192505 183291, 192305 183291, 192305 183491, 192505 183491)))",
    "lon": 192405,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 22984.80773,
    "House_pc": 57.44916456,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00318,
    "Park_PCT": 0,
    "id": 607,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 183491, 192705 183291, 192505 183291, 192505 183491, 192705 183491)))",
    "lon": 192605,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 31232.63021,
    "House_pc": 78.06410222,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00432,
    "Park_PCT": 0,
    "id": 608,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 183491, 192905 183291, 192705 183291, 192705 183491, 192905 183491)))",
    "lon": 192805,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 31472.20721,
    "House_pc": 78.66290503,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00435,
    "Park_PCT": 0,
    "id": 609,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 183491, 193105 183291, 192905 183291, 192905 183491, 193105 183491)))",
    "lon": 193005,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 20111.96224,
    "House_pc": 50.26864668,
    "Park_area": 8207.424384,
    "Park_pc": 20.51396635,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00278,
    "Park_PCT": 0.00114,
    "id": 610,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 183491, 193305 183291, 193105 183291, 193105 183491, 193305 183491)))",
    "lon": 193205,
    "lat": 183391,
    "Commercial": 5464.928741,
    "Commerci_1": 13.65926159,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 9322.983805,
    "Park_pc": 23.30223881,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00076,
    "House_PCT": 0,
    "Park_PCT": 0.00129,
    "id": 611,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 183491, 193505 183291, 193305 183291, 193305 183491, 193505 183491)))",
    "lon": 193405,
    "lat": 183391,
    "Commercial": 19600.4535,
    "Commerci_1": 48.99015463,
    "Factory_ar": 2034.316664,
    "Factory_pc": 5.084652145,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00028,
    "Commerc_PC": 0.00271,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 612,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 183491, 193705 183291, 193505 183291, 193505 183491, 193705 183491)))",
    "lon": 193605,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 13348.30624,
    "Factory_pc": 33.36328645,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 4982.489631,
    "Park_pc": 12.45343236,
    "Govern_PCT": 0,
    "Factory__1": 0.00185,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00069,
    "id": 613,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 183491, 193905 183291, 193705 183291, 193705 183491, 193905 183491)))",
    "lon": 193805,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 1643.610772,
    "Factory_pc": 4.108105749,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 22320.66617,
    "Park_pc": 55.78915554,
    "Govern_PCT": 0,
    "Factory__1": 0.00023,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00309,
    "id": 614,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 183491, 194105 183291, 193905 183291, 193905 183491, 194105 183491)))",
    "lon": 194005,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 615,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 183491, 194305 183291, 194105 183291, 194105 183491, 194305 183491)))",
    "lon": 194205,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 616,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 183491, 194505 183291, 194305 183291, 194305 183491, 194505 183491)))",
    "lon": 194405,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 617,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 183491, 194705 183291, 194505 183291, 194505 183491, 194705 183491)))",
    "lon": 194605,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 618,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 183491, 194905 183291, 194705 183291, 194705 183491, 194905 183491)))",
    "lon": 194805,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 619,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 183491, 195105 183291, 194905 183291, 194905 183491, 195105 183491)))",
    "lon": 195005,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 620,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 183491, 195305 183291, 195105 183291, 195105 183491, 195305 183491)))",
    "lon": 195205,
    "lat": 183391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 621,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 183691, 190105 183491, 189905 183491, 189905 183691, 190105 183691)))",
    "lon": 190005,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 622,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 183691, 190305 183491, 190105 183491, 190105 183691, 190305 183691)))",
    "lon": 190205,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 623,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 183691, 190505 183491, 190305 183491, 190305 183691, 190505 183691)))",
    "lon": 190405,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 624,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 183691, 190705 183491, 190505 183491, 190505 183691, 190705 183691)))",
    "lon": 190605,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 625,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 183691, 190905 183491, 190705 183491, 190705 183691, 190905 183691)))",
    "lon": 190805,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 626,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 183691, 191105 183491, 190905 183491, 190905 183691, 191105 183691)))",
    "lon": 191005,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 627,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 183691, 191305 183491, 191105 183491, 191105 183691, 191305 183691)))",
    "lon": 191205,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 3411.381606,
    "House_pc": 8.526550244,
    "Park_area": 15098.13611,
    "Park_pc": 37.73691454,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00047,
    "Park_PCT": 0.00209,
    "id": 628,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 183691, 191505 183491, 191305 183491, 191305 183691, 191505 183691)))",
    "lon": 191405,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 21513.64033,
    "House_pc": 53.77209023,
    "Park_area": 1195.508579,
    "Park_pc": 2.98810402,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00298,
    "Park_PCT": 0.00017,
    "id": 629,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 183691, 191705 183491, 191505 183491, 191505 183691, 191705 183691)))",
    "lon": 191605,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19677.26084,
    "House_pc": 49.1821626,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00272,
    "Park_PCT": 0,
    "id": 630,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 183691, 191905 183491, 191705 183491, 191705 183691, 191905 183691)))",
    "lon": 191805,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 30859.47861,
    "House_pc": 77.13145559,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00427,
    "Park_PCT": 0,
    "id": 631,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 183691, 192105 183491, 191905 183491, 191905 183691, 192105 183691)))",
    "lon": 192005,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 3982.489974,
    "House_pc": 9.953999155,
    "Park_area": 6990.524436,
    "Park_pc": 17.47240415,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00055,
    "Park_PCT": 0.00097,
    "id": 632,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 183691, 192305 183491, 192105 183491, 192105 183691, 192305 183691)))",
    "lon": 192205,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 30321.98833,
    "House_pc": 75.78801824,
    "Park_area": 4185.430177,
    "Park_pc": 10.46123543,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00419,
    "Park_PCT": 0.00058,
    "id": 633,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 183691, 192505 183491, 192305 183491, 192305 183691, 192505 183691)))",
    "lon": 192405,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11217.11531,
    "House_pc": 28.03651483,
    "Park_area": 2502.712477,
    "Park_pc": 6.255381487,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00155,
    "Park_PCT": 0.00035,
    "id": 634,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 183691, 192705 183491, 192505 183491, 192505 183691, 192705 183691)))",
    "lon": 192605,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 30085.74621,
    "House_pc": 75.19753375,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00416,
    "Park_PCT": 0,
    "id": 635,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 183691, 192905 183491, 192705 183491, 192705 183691, 192905 183691)))",
    "lon": 192805,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 26666.04878,
    "House_pc": 66.65019857,
    "Park_area": 561.7968275,
    "Park_pc": 1.404177665,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00369,
    "Park_PCT": 0.00008,
    "id": 636,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 183691, 193105 183491, 192905 183491, 192905 183691, 193105 183691)))",
    "lon": 193005,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 8075.685861,
    "House_pc": 20.18469377,
    "Park_area": 5297.480089,
    "Park_pc": 13.24073462,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00112,
    "Park_PCT": 0.00073,
    "id": 637,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 183691, 193305 183491, 193105 183491, 193105 183691, 193305 183691)))",
    "lon": 193205,
    "lat": 183591,
    "Commercial": 21336.4155,
    "Commerci_1": 53.32909068,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6316.644643,
    "Park_pc": 15.78807439,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00295,
    "House_PCT": 0,
    "Park_PCT": 0.00087,
    "id": 638,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 183691, 193505 183491, 193305 183491, 193305 183691, 193505 183691)))",
    "lon": 193405,
    "lat": 183591,
    "Commercial": 26466.17871,
    "Commerci_1": 66.15062176,
    "Factory_ar": 5853.24683,
    "Factory_pc": 14.62983838,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00081,
    "Commerc_PC": 0.00366,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 639,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 183691, 193705 183491, 193505 183491, 193505 183691, 193705 183691)))",
    "lon": 193605,
    "lat": 183591,
    "Commercial": 318.4388261,
    "Commerci_1": 0.795918641,
    "Factory_ar": 20672.59796,
    "Factory_pc": 51.66991185,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00286,
    "Commerc_PC": 0.00004,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 640,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 183691, 193905 183491, 193705 183491, 193705 183691, 193905 183691)))",
    "lon": 193805,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 30888.64922,
    "Factory_pc": 77.20431106,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00427,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 641,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 183691, 194105 183491, 193905 183491, 193905 183691, 194105 183691)))",
    "lon": 194005,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 15789.24814,
    "Factory_pc": 39.46426867,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00218,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 642,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 183691, 194305 183491, 194105 183491, 194105 183691, 194305 183691)))",
    "lon": 194205,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 643,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 183691, 194505 183491, 194305 183491, 194305 183691, 194505 183691)))",
    "lon": 194405,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 644,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 183691, 194705 183491, 194505 183491, 194505 183691, 194705 183691)))",
    "lon": 194605,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 645,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 183691, 194905 183491, 194705 183491, 194705 183691, 194905 183691)))",
    "lon": 194805,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 646,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 183691, 195105 183491, 194905 183491, 194905 183691, 195105 183691)))",
    "lon": 195005,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 647,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 183691, 195305 183491, 195105 183491, 195105 183691, 195305 183691)))",
    "lon": 195205,
    "lat": 183591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 648,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 183891, 190105 183691, 189905 183691, 189905 183891, 190105 183891)))",
    "lon": 190005,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 649,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 183891, 190305 183691, 190105 183691, 190105 183891, 190305 183891)))",
    "lon": 190205,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 650,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 183891, 190505 183691, 190305 183691, 190305 183891, 190505 183891)))",
    "lon": 190405,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 651,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 183891, 190705 183691, 190505 183691, 190505 183891, 190705 183891)))",
    "lon": 190605,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 652,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 183891, 190905 183691, 190705 183691, 190705 183891, 190905 183891)))",
    "lon": 190805,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 653,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 183891, 191105 183691, 190905 183691, 190905 183891, 191105 183891)))",
    "lon": 191005,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 654,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 183891, 191305 183691, 191105 183691, 191105 183891, 191305 183891)))",
    "lon": 191205,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1320.224813,
    "House_pc": 3.29982526,
    "Park_area": 13840.44325,
    "Park_pc": 34.59338422,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00018,
    "Park_PCT": 0.00191,
    "id": 655,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 183891, 191505 183691, 191305 183691, 191305 183891, 191505 183891)))",
    "lon": 191405,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 24047.79123,
    "House_pc": 60.10605264,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00333,
    "Park_PCT": 0,
    "id": 656,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 183891, 191705 183691, 191505 183691, 191505 183891, 191705 183891)))",
    "lon": 191605,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 29524.21499,
    "House_pc": 73.79404849,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00408,
    "Park_PCT": 0,
    "id": 657,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 183891, 191905 183691, 191705 183691, 191705 183891, 191905 183891)))",
    "lon": 191805,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 32344.22109,
    "House_pc": 80.84248216,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00447,
    "Park_PCT": 0,
    "id": 658,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 183891, 192105 183691, 191905 183691, 191905 183891, 192105 183891)))",
    "lon": 192005,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19106.95024,
    "House_pc": 47.75669684,
    "Park_area": 12862.74769,
    "Park_pc": 32.1496803,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00264,
    "Park_PCT": 0.00178,
    "id": 659,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 183891, 192305 183691, 192105 183691, 192105 183891, 192305 183891)))",
    "lon": 192205,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 34561.9738,
    "House_pc": 86.38561129,
    "Park_area": 1541.363194,
    "Park_pc": 3.852546227,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00478,
    "Park_PCT": 0.00021,
    "id": 660,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 183891, 192505 183691, 192305 183691, 192305 183891, 192505 183891)))",
    "lon": 192405,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 26826.72962,
    "House_pc": 67.05182043,
    "Park_area": 5744.473505,
    "Park_pc": 14.357971,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00371,
    "Park_PCT": 0.00079,
    "id": 661,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 183891, 192705 183691, 192505 183691, 192505 183891, 192705 183891)))",
    "lon": 192605,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 26763.20956,
    "House_pc": 66.89305086,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0037,
    "Park_PCT": 0,
    "id": 662,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 183891, 192905 183691, 192705 183691, 192705 183891, 192905 183891)))",
    "lon": 192805,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 10086.86275,
    "House_pc": 25.21151183,
    "Park_area": 12447.82319,
    "Park_pc": 31.11259164,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0014,
    "Park_PCT": 0.00172,
    "id": 663,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 183891, 193105 183691, 192905 183691, 192905 183891, 193105 183891)))",
    "lon": 193005,
    "lat": 183791,
    "Commercial": 949.8190727,
    "Commerci_1": 2.374015956,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 2.638088165,
    "House_pc": 0.006593744,
    "Park_area": 7377.684676,
    "Park_pc": 18.44008153,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00013,
    "House_PCT": 0,
    "Park_PCT": 0.00102,
    "id": 664,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 183891, 193305 183691, 193105 183691, 193105 183891, 193305 183891)))",
    "lon": 193205,
    "lat": 183791,
    "Commercial": 33084.54925,
    "Commerci_1": 82.69284619,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 763.343515,
    "Park_pc": 1.907931325,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00458,
    "House_PCT": 0,
    "Park_PCT": 0.00011,
    "id": 665,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 183891, 193505 183691, 193305 183691, 193305 183891, 193505 183891)))",
    "lon": 193405,
    "lat": 183791,
    "Commercial": 27646.10126,
    "Commerci_1": 69.09976711,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00382,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 666,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 183891, 193705 183691, 193505 183691, 193505 183891, 193705 183891)))",
    "lon": 193605,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 28071.67622,
    "Factory_pc": 70.16346163,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00388,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 667,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 183891, 193905 183691, 193705 183691, 193705 183891, 193905 183891)))",
    "lon": 193805,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 28202.88834,
    "Factory_pc": 70.49141405,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 2728.567635,
    "Park_pc": 6.819889813,
    "Govern_PCT": 0,
    "Factory__1": 0.0039,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00038,
    "id": 668,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 183891, 194105 183691, 193905 183691, 193905 183891, 194105 183891)))",
    "lon": 194005,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 28752.32282,
    "Factory_pc": 71.864688,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00398,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 669,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 183891, 194305 183691, 194105 183691, 194105 183891, 194305 183891)))",
    "lon": 194205,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 88.27326781,
    "Factory_pc": 0.220633669,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00001,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 670,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 183891, 194505 183691, 194305 183691, 194305 183891, 194505 183891)))",
    "lon": 194405,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 671,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 183891, 194705 183691, 194505 183691, 194505 183891, 194705 183891)))",
    "lon": 194605,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 672,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 183891, 194905 183691, 194705 183691, 194705 183891, 194905 183891)))",
    "lon": 194805,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 673,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 183891, 195105 183691, 194905 183691, 194905 183891, 195105 183891)))",
    "lon": 195005,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 674,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 183891, 195305 183691, 195105 183691, 195105 183891, 195305 183891)))",
    "lon": 195205,
    "lat": 183791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 675,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 184091, 190105 183891, 189905 183891, 189905 184091, 190105 184091)))",
    "lon": 190005,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 676,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 184091, 190305 183891, 190105 183891, 190105 184091, 190305 184091)))",
    "lon": 190205,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 677,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 184091, 190505 183891, 190305 183891, 190305 184091, 190505 184091)))",
    "lon": 190405,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 678,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 184091, 190705 183891, 190505 183891, 190505 184091, 190705 184091)))",
    "lon": 190605,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 679,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 184091, 190905 183891, 190705 183891, 190705 184091, 190905 184091)))",
    "lon": 190805,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 680,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 184091, 191105 183891, 190905 183891, 190905 184091, 191105 184091)))",
    "lon": 191005,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 681,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 184091, 191305 183891, 191105 183891, 191105 184091, 191305 184091)))",
    "lon": 191205,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 12744.19373,
    "Park_pc": 31.85337218,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00176,
    "id": 682,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 184091, 191505 183891, 191305 183891, 191305 184091, 191505 184091)))",
    "lon": 191405,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 18385.872,
    "House_pc": 45.95441545,
    "Park_area": 5396.151215,
    "Park_pc": 13.48736545,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00254,
    "Park_PCT": 0.00075,
    "id": 683,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 184091, 191705 183891, 191505 183891, 191505 184091, 191705 184091)))",
    "lon": 191605,
    "lat": 183991,
    "Commercial": 2659.517778,
    "Commerci_1": 6.647309121,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 22382.47448,
    "House_pc": 55.94368573,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00037,
    "House_PCT": 0.0031,
    "Park_PCT": 0,
    "id": 684,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 184091, 191905 183891, 191705 183891, 191705 184091, 191905 184091)))",
    "lon": 191805,
    "lat": 183991,
    "Commercial": 9308.464514,
    "Commerci_1": 23.26596067,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 9732.665156,
    "House_pc": 24.32622527,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00129,
    "House_PCT": 0.00135,
    "Park_PCT": 0,
    "id": 685,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 184091, 192105 183891, 191905 183891, 191905 184091, 192105 184091)))",
    "lon": 192005,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 19711.24082,
    "House_pc": 49.26708548,
    "Park_area": 11459.08019,
    "Park_pc": 28.64129603,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00273,
    "Park_PCT": 0.00158,
    "id": 686,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 184091, 192305 183891, 192105 183891, 192105 184091, 192305 184091)))",
    "lon": 192205,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 31510.30971,
    "House_pc": 78.75815711,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00436,
    "Park_PCT": 0,
    "id": 687,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 184091, 192505 183891, 192305 183891, 192305 184091, 192505 184091)))",
    "lon": 192405,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 23884.55012,
    "House_pc": 59.69801712,
    "Park_area": 9343.068538,
    "Park_pc": 23.35244594,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0033,
    "Park_PCT": 0.00129,
    "id": 688,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 184091, 192705 183891, 192505 183891, 192505 184091, 192705 184091)))",
    "lon": 192605,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 16184.48028,
    "House_pc": 40.45214603,
    "Park_area": 4236.696703,
    "Park_pc": 10.58937147,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00224,
    "Park_PCT": 0.00059,
    "id": 689,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 184091, 192905 183891, 192705 183891, 192705 184091, 192905 184091)))",
    "lon": 192805,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 5361.686882,
    "House_pc": 13.40121656,
    "Park_area": 11041.54873,
    "Park_pc": 27.59769248,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00074,
    "Park_PCT": 0.00153,
    "id": 690,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 184091, 193105 183891, 192905 183891, 192905 184091, 193105 184091)))",
    "lon": 193005,
    "lat": 183991,
    "Commercial": 8644.966755,
    "Commerci_1": 21.60757726,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 11438.25607,
    "Park_pc": 28.5892368,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.0012,
    "House_PCT": 0,
    "Park_PCT": 0.00158,
    "id": 691,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 184091, 193305 183891, 193105 183891, 193105 184091, 193305 184091)))",
    "lon": 193205,
    "lat": 183991,
    "Commercial": 36230.11054,
    "Commerci_1": 90.55498783,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00501,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 692,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 184091, 193505 183891, 193305 183891, 193305 184091, 193505 184091)))",
    "lon": 193405,
    "lat": 183991,
    "Commercial": 16727.89085,
    "Commerci_1": 41.8103569,
    "Factory_ar": 5047.1531,
    "Factory_pc": 12.61505556,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.0007,
    "Commerc_PC": 0.00231,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 693,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 184091, 193705 183891, 193505 183891, 193505 184091, 193705 184091)))",
    "lon": 193605,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 28770.40639,
    "Factory_pc": 71.90989546,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 148.2156115,
    "Park_pc": 0.370455981,
    "Govern_PCT": 0,
    "Factory__1": 0.00398,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00002,
    "id": 694,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 184091, 193905 183891, 193705 183891, 193705 184091, 193905 184091)))",
    "lon": 193805,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 13905.1037,
    "Factory_pc": 34.75496585,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 17241.58546,
    "Park_pc": 43.09430024,
    "Govern_PCT": 0,
    "Factory__1": 0.00192,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00238,
    "id": 695,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 184091, 194105 183891, 193905 183891, 193905 184091, 194105 184091)))",
    "lon": 194005,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 32409.59726,
    "Factory_pc": 81.00582367,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00448,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 696,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 184091, 194305 183891, 194105 183891, 194105 184091, 194305 184091)))",
    "lon": 194205,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 569.2871935,
    "Factory_pc": 1.422898747,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00008,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 697,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 184091, 194505 183891, 194305 183891, 194305 184091, 194505 184091)))",
    "lon": 194405,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 698,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 184091, 194705 183891, 194505 183891, 194505 184091, 194705 184091)))",
    "lon": 194605,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 699,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 184091, 194905 183891, 194705 183891, 194705 184091, 194905 184091)))",
    "lon": 194805,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 700,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 184091, 195105 183891, 194905 183891, 194905 184091, 195105 184091)))",
    "lon": 195005,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 701,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 184091, 195305 183891, 195105 183891, 195105 184091, 195305 184091)))",
    "lon": 195205,
    "lat": 183991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 702,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 184291, 190105 184091, 189905 184091, 189905 184291, 190105 184291)))",
    "lon": 190005,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 703,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 184291, 190305 184091, 190105 184091, 190105 184291, 190305 184291)))",
    "lon": 190205,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 704,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 184291, 190505 184091, 190305 184091, 190305 184291, 190505 184291)))",
    "lon": 190405,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 705,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 184291, 190705 184091, 190505 184091, 190505 184291, 190705 184291)))",
    "lon": 190605,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 706,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 184291, 190905 184091, 190705 184091, 190705 184291, 190905 184291)))",
    "lon": 190805,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 707,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 184291, 191105 184091, 190905 184091, 190905 184291, 191105 184291)))",
    "lon": 191005,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 708,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 184291, 191305 184091, 191105 184091, 191105 184291, 191305 184291)))",
    "lon": 191205,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 8358.589656,
    "Park_pc": 20.89180944,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00116,
    "id": 709,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 184291, 191505 184091, 191305 184091, 191305 184291, 191505 184291)))",
    "lon": 191405,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 15647.26298,
    "House_pc": 39.1094218,
    "Park_area": 9848.326964,
    "Park_pc": 24.61531922,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00216,
    "Park_PCT": 0.00136,
    "id": 710,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 184291, 191705 184091, 191505 184091, 191505 184291, 191705 184291)))",
    "lon": 191605,
    "lat": 184191,
    "Commercial": 3589.121411,
    "Commerci_1": 8.970799017,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 28901.06076,
    "House_pc": 72.23651076,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.0005,
    "House_PCT": 0.004,
    "Park_PCT": 0,
    "id": 711,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 184291, 191905 184091, 191705 184091, 191705 184291, 191905 184291)))",
    "lon": 191805,
    "lat": 184191,
    "Commercial": 7537.564794,
    "Commerci_1": 18.83970074,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 13865.75414,
    "House_pc": 34.65663853,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00104,
    "House_PCT": 0.00192,
    "Park_PCT": 0,
    "id": 712,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 184291, 192105 184091, 191905 184091, 191905 184291, 192105 184291)))",
    "lon": 192005,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11300.23591,
    "House_pc": 28.24427408,
    "Park_area": 7598.580916,
    "Park_pc": 18.99220544,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00156,
    "Park_PCT": 0.00105,
    "id": 713,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 184291, 192305 184091, 192105 184091, 192105 184291, 192305 184291)))",
    "lon": 192205,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 11808.02633,
    "House_pc": 29.51346402,
    "Park_area": 1000.344976,
    "Park_pc": 2.500303151,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00163,
    "Park_PCT": 0.00014,
    "id": 714,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 184291, 192505 184091, 192305 184091, 192305 184291, 192505 184291)))",
    "lon": 192405,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 32602.20227,
    "House_pc": 81.48727177,
    "Park_area": 5228.92505,
    "Park_pc": 13.06938817,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00451,
    "Park_PCT": 0.00072,
    "id": 715,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 184291, 192705 184091, 192505 184091, 192505 184291, 192705 184291)))",
    "lon": 192605,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 10300.65871,
    "House_pc": 25.74588388,
    "Park_area": 17209.7189,
    "Park_pc": 43.01466895,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00142,
    "Park_PCT": 0.00238,
    "id": 716,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 184291, 192905 184091, 192705 184091, 192705 184291, 192905 184291)))",
    "lon": 192805,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 8359.895865,
    "Park_pc": 20.89506106,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00116,
    "id": 717,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 184291, 193105 184091, 192905 184091, 192905 184291, 193105 184291)))",
    "lon": 193005,
    "lat": 184191,
    "Commercial": 11848.48417,
    "Commerci_1": 29.61457737,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 11338.80428,
    "Park_pc": 28.34066297,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00164,
    "House_PCT": 0,
    "Park_PCT": 0.00157,
    "id": 718,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 184291, 193305 184091, 193105 184091, 193105 184291, 193305 184291)))",
    "lon": 193205,
    "lat": 184191,
    "Commercial": 26820.35238,
    "Commerci_1": 67.03586173,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00371,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 719,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 184291, 193505 184091, 193305 184091, 193305 184291, 193505 184291)))",
    "lon": 193405,
    "lat": 184191,
    "Commercial": 5984.727671,
    "Commerci_1": 14.95846678,
    "Factory_ar": 13554.0551,
    "Factory_pc": 33.87754534,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00187,
    "Commerc_PC": 0.00083,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 720,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 184291, 193705 184091, 193505 184091, 193505 184291, 193705 184291)))",
    "lon": 193605,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 29086.13179,
    "Factory_pc": 72.69903198,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00402,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 721,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 184291, 193905 184091, 193705 184091, 193705 184291, 193905 184291)))",
    "lon": 193805,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 32645.05489,
    "Factory_pc": 81.59434054,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00452,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 722,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 184291, 194105 184091, 193905 184091, 193905 184291, 194105 184291)))",
    "lon": 194005,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 32410.37436,
    "Factory_pc": 81.00776589,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00448,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 723,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 184291, 194305 184091, 194105 184091, 194105 184291, 194305 184291)))",
    "lon": 194205,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 8433.842619,
    "Factory_pc": 21.07987711,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00117,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 724,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 184291, 194505 184091, 194305 184091, 194305 184291, 194505 184291)))",
    "lon": 194405,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 725,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 184291, 194705 184091, 194505 184091, 194505 184291, 194705 184291)))",
    "lon": 194605,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 726,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 184291, 194905 184091, 194705 184091, 194705 184291, 194905 184291)))",
    "lon": 194805,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 727,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 184291, 195105 184091, 194905 184091, 194905 184291, 195105 184291)))",
    "lon": 195005,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 728,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 184291, 195305 184091, 195105 184091, 195105 184291, 195305 184291)))",
    "lon": 195205,
    "lat": 184191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 729,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 184491, 190105 184291, 189905 184291, 189905 184491, 190105 184491)))",
    "lon": 190005,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 730,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 184491, 190305 184291, 190105 184291, 190105 184491, 190305 184491)))",
    "lon": 190205,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 731,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 184491, 190505 184291, 190305 184291, 190305 184491, 190505 184491)))",
    "lon": 190405,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 732,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 184491, 190705 184291, 190505 184291, 190505 184491, 190705 184491)))",
    "lon": 190605,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 733,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 184491, 190905 184291, 190705 184291, 190705 184491, 190905 184491)))",
    "lon": 190805,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 734,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 184491, 191105 184291, 190905 184291, 190905 184491, 191105 184491)))",
    "lon": 191005,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 735,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 184491, 191305 184291, 191105 184291, 191105 184491, 191305 184491)))",
    "lon": 191205,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 3918.326167,
    "Park_pc": 9.793628695,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00054,
    "id": 736,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 184491, 191505 184291, 191305 184291, 191305 184491, 191505 184491)))",
    "lon": 191405,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 16809.29439,
    "House_pc": 42.0138515,
    "Park_area": 11103.75183,
    "Park_pc": 27.75318047,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00232,
    "Park_PCT": 0.00154,
    "id": 737,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 184491, 191705 184291, 191505 184291, 191505 184491, 191705 184491)))",
    "lon": 191605,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 38526.79815,
    "House_pc": 96.29547817,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00533,
    "Park_PCT": 0,
    "id": 738,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 184491, 191905 184291, 191705 184291, 191705 184491, 191905 184491)))",
    "lon": 191805,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 23835.11257,
    "House_pc": 59.57446466,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0033,
    "Park_PCT": 0,
    "id": 739,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 184491, 192105 184291, 191905 184291, 191905 184491, 192105 184491)))",
    "lon": 192005,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 28641.13041,
    "House_pc": 71.58681841,
    "Park_area": 669.9655448,
    "Park_pc": 1.674539416,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00396,
    "Park_PCT": 0.00009,
    "id": 740,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 184491, 192305 184291, 192105 184291, 192105 184491, 192305 184491)))",
    "lon": 192205,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 26780.28915,
    "House_pc": 66.93575006,
    "Park_area": 6289.008414,
    "Park_pc": 15.71900486,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.0037,
    "Park_PCT": 0.00087,
    "id": 741,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 184491, 192505 184291, 192305 184291, 192305 184491, 192505 184491)))",
    "lon": 192405,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 33748.79533,
    "House_pc": 84.35311304,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00467,
    "Park_PCT": 0,
    "id": 742,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 184491, 192705 184291, 192505 184291, 192505 184491, 192705 184491)))",
    "lon": 192605,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 9473.564645,
    "House_pc": 23.67861142,
    "Park_area": 8794.558382,
    "Park_pc": 21.98147565,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00131,
    "Park_PCT": 0.00122,
    "id": 743,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 184491, 192905 184291, 192705 184291, 192705 184491, 192905 184491)))",
    "lon": 192805,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 13220.13133,
    "Park_pc": 33.04292964,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00183,
    "id": 744,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 184491, 193105 184291, 192905 184291, 192905 184491, 193105 184491)))",
    "lon": 193005,
    "lat": 184391,
    "Commercial": 18179.60903,
    "Commerci_1": 45.43884515,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 7769.475193,
    "Park_pc": 19.41933842,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00251,
    "House_PCT": 0,
    "Park_PCT": 0.00107,
    "id": 745,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 184491, 193305 184291, 193105 184291, 193105 184491, 193305 184491)))",
    "lon": 193205,
    "lat": 184391,
    "Commercial": 30689.01062,
    "Commerci_1": 76.70534082,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00424,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 746,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 184491, 193505 184291, 193305 184291, 193305 184491, 193505 184491)))",
    "lon": 193405,
    "lat": 184391,
    "Commercial": 4.919502744,
    "Commerci_1": 0.012296001,
    "Factory_ar": 22351.37061,
    "Factory_pc": 55.86590616,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00309,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 747,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 184491, 193705 184291, 193505 184291, 193505 184491, 193705 184491)))",
    "lon": 193605,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 22573.79231,
    "Factory_pc": 56.42183221,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00312,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 748,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 184491, 193905 184291, 193705 184291, 193705 184491, 193905 184491)))",
    "lon": 193805,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 13300.93088,
    "Factory_pc": 33.24487234,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00184,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 749,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 184491, 194105 184291, 193905 184291, 193905 184491, 194105 184491)))",
    "lon": 194005,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 4934.54862,
    "Factory_pc": 12.33360511,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0.00068,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 750,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 184491, 194305 184291, 194105 184291, 194105 184491, 194305 184491)))",
    "lon": 194205,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 4.724893733,
    "Factory_pc": 0.011809585,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 751,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 184491, 194505 184291, 194305 184291, 194305 184491, 194505 184491)))",
    "lon": 194405,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 752,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 184491, 194705 184291, 194505 184291, 194505 184491, 194705 184491)))",
    "lon": 194605,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 753,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 184491, 194905 184291, 194705 184291, 194705 184491, 194905 184491)))",
    "lon": 194805,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 754,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 184491, 195105 184291, 194905 184291, 194905 184491, 195105 184491)))",
    "lon": 195005,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 755,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 184491, 195305 184291, 195105 184291, 195105 184491, 195305 184491)))",
    "lon": 195205,
    "lat": 184391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 756,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 184691, 190105 184491, 189905 184491, 189905 184691, 190105 184691)))",
    "lon": 190005,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 757,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 184691, 190305 184491, 190105 184491, 190105 184691, 190305 184691)))",
    "lon": 190205,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 758,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 184691, 190505 184491, 190305 184491, 190305 184691, 190505 184691)))",
    "lon": 190405,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 759,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 184691, 190705 184491, 190505 184491, 190505 184691, 190705 184691)))",
    "lon": 190605,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 760,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 184691, 190905 184491, 190705 184491, 190705 184691, 190905 184691)))",
    "lon": 190805,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 761,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 184691, 191105 184491, 190905 184491, 190905 184691, 191105 184691)))",
    "lon": 191005,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 762,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 184691, 191305 184491, 191105 184491, 191105 184691, 191305 184691)))",
    "lon": 191205,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 185.2807844,
    "Park_pc": 0.46309856,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00003,
    "id": 763,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 184691, 191505 184491, 191305 184491, 191305 184691, 191505 184691)))",
    "lon": 191405,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 3569.023669,
    "House_pc": 8.92056661,
    "Park_area": 18200.94426,
    "Park_pc": 45.49219919,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00049,
    "Park_PCT": 0.00252,
    "id": 764,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 184691, 191705 184491, 191505 184491, 191505 184691, 191705 184691)))",
    "lon": 191605,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 10206.73768,
    "House_pc": 25.5111437,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00141,
    "Park_PCT": 0,
    "id": 765,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 184691, 191905 184491, 191705 184491, 191705 184691, 191905 184691)))",
    "lon": 191805,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 2038.631304,
    "House_pc": 5.095439262,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00028,
    "Park_PCT": 0,
    "id": 766,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 184691, 192105 184491, 191905 184491, 191905 184691, 192105 184691)))",
    "lon": 192005,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 1543.88603,
    "House_pc": 3.858852186,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0.00021,
    "Park_PCT": 0,
    "id": 767,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 184691, 192305 184491, 192105 184491, 192105 184691, 192305 184691)))",
    "lon": 192205,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 6.067528364,
    "House_pc": 0.015165429,
    "Park_area": 199.2041322,
    "Park_pc": 0.497898955,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00003,
    "id": 768,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 184691, 192505 184491, 192305 184491, 192305 184691, 192505 184691)))",
    "lon": 192405,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 769,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 184691, 192705 184491, 192505 184491, 192505 184691, 192705 184691)))",
    "lon": 192605,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 6046.51768,
    "Park_pc": 15.11291132,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00084,
    "id": 770,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 184691, 192905 184491, 192705 184491, 192705 184691, 192905 184691)))",
    "lon": 192805,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 7765.178732,
    "Park_pc": 19.40860101,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00107,
    "id": 771,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 184691, 193105 184491, 192905 184491, 192905 184691, 193105 184691)))",
    "lon": 193005,
    "lat": 184591,
    "Commercial": 2371.736495,
    "Commerci_1": 5.92801347,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 3003.423957,
    "Park_pc": 7.506878487,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00033,
    "House_PCT": 0,
    "Park_PCT": 0.00042,
    "id": 772,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 184691, 193305 184491, 193105 184491, 193105 184691, 193305 184691)))",
    "lon": 193205,
    "lat": 184591,
    "Commercial": 569.689568,
    "Commerci_1": 1.423904894,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0.00008,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 773,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 184691, 193505 184491, 193305 184491, 193305 184691, 193505 184691)))",
    "lon": 193405,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 774,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 184691, 193705 184491, 193505 184491, 193505 184691, 193705 184691)))",
    "lon": 193605,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 775,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 184691, 193905 184491, 193705 184491, 193705 184691, 193905 184691)))",
    "lon": 193805,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 776,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 184691, 194105 184491, 193905 184491, 193905 184691, 194105 184691)))",
    "lon": 194005,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 777,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 184691, 194305 184491, 194105 184491, 194105 184691, 194305 184691)))",
    "lon": 194205,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 778,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 184691, 194505 184491, 194305 184491, 194305 184691, 194505 184691)))",
    "lon": 194405,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 779,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 184691, 194705 184491, 194505 184491, 194505 184691, 194705 184691)))",
    "lon": 194605,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 780,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 184691, 194905 184491, 194705 184491, 194705 184691, 194905 184691)))",
    "lon": 194805,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 781,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 184691, 195105 184491, 194905 184491, 194905 184691, 195105 184691)))",
    "lon": 195005,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 782,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 184691, 195305 184491, 195105 184491, 195105 184691, 195305 184691)))",
    "lon": 195205,
    "lat": 184591,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 783,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 184891, 190105 184691, 189905 184691, 189905 184891, 190105 184891)))",
    "lon": 190005,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 784,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 184891, 190305 184691, 190105 184691, 190105 184891, 190305 184891)))",
    "lon": 190205,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 785,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 184891, 190505 184691, 190305 184691, 190305 184891, 190505 184891)))",
    "lon": 190405,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 786,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 184891, 190705 184691, 190505 184691, 190505 184891, 190705 184891)))",
    "lon": 190605,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 787,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 184891, 190905 184691, 190705 184691, 190705 184891, 190905 184891)))",
    "lon": 190805,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 788,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 184891, 191105 184691, 190905 184691, 190905 184891, 191105 184891)))",
    "lon": 191005,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 789,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 184891, 191305 184691, 191105 184691, 191105 184891, 191305 184891)))",
    "lon": 191205,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 790,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 184891, 191505 184691, 191305 184691, 191305 184891, 191505 184891)))",
    "lon": 191405,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 14026.0252,
    "Park_pc": 35.05723232,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0.00194,
    "id": 791,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 184891, 191705 184691, 191505 184691, 191505 184891, 191705 184891)))",
    "lon": 191605,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 792,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 184891, 191905 184691, 191705 184691, 191705 184891, 191905 184891)))",
    "lon": 191805,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 793,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 184891, 192105 184691, 191905 184691, 191905 184891, 192105 184891)))",
    "lon": 192005,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 794,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 184891, 192305 184691, 192105 184691, 192105 184891, 192305 184891)))",
    "lon": 192205,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 795,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 184891, 192505 184691, 192305 184691, 192305 184891, 192505 184891)))",
    "lon": 192405,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 796,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 184891, 192705 184691, 192505 184691, 192505 184891, 192705 184891)))",
    "lon": 192605,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 797,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 184891, 192905 184691, 192705 184691, 192705 184891, 192905 184891)))",
    "lon": 192805,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 798,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 184891, 193105 184691, 192905 184691, 192905 184891, 193105 184891)))",
    "lon": 193005,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 799,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 184891, 193305 184691, 193105 184691, 193105 184891, 193305 184891)))",
    "lon": 193205,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 800,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 184891, 193505 184691, 193305 184691, 193305 184891, 193505 184891)))",
    "lon": 193405,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 801,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 184891, 193705 184691, 193505 184691, 193505 184891, 193705 184891)))",
    "lon": 193605,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 802,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 184891, 193905 184691, 193705 184691, 193705 184891, 193905 184891)))",
    "lon": 193805,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 803,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 184891, 194105 184691, 193905 184691, 193905 184891, 194105 184891)))",
    "lon": 194005,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 804,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 184891, 194305 184691, 194105 184691, 194105 184891, 194305 184891)))",
    "lon": 194205,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 805,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 184891, 194505 184691, 194305 184691, 194305 184891, 194505 184891)))",
    "lon": 194405,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 806,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 184891, 194705 184691, 194505 184691, 194505 184891, 194705 184891)))",
    "lon": 194605,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 807,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 184891, 194905 184691, 194705 184691, 194705 184891, 194905 184891)))",
    "lon": 194805,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 808,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 184891, 195105 184691, 194905 184691, 194905 184891, 195105 184891)))",
    "lon": 195005,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 809,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 184891, 195305 184691, 195105 184691, 195105 184891, 195305 184891)))",
    "lon": 195205,
    "lat": 184791,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 810,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 185091, 190105 184891, 189905 184891, 189905 185091, 190105 185091)))",
    "lon": 190005,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 811,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 185091, 190305 184891, 190105 184891, 190105 185091, 190305 185091)))",
    "lon": 190205,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 812,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 185091, 190505 184891, 190305 184891, 190305 185091, 190505 185091)))",
    "lon": 190405,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 813,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 185091, 190705 184891, 190505 184891, 190505 185091, 190705 185091)))",
    "lon": 190605,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 814,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 185091, 190905 184891, 190705 184891, 190705 185091, 190905 185091)))",
    "lon": 190805,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 815,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 185091, 191105 184891, 190905 184891, 190905 185091, 191105 185091)))",
    "lon": 191005,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 816,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 185091, 191305 184891, 191105 184891, 191105 185091, 191305 185091)))",
    "lon": 191205,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 817,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 185091, 191505 184891, 191305 184891, 191305 185091, 191505 185091)))",
    "lon": 191405,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 818,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 185091, 191705 184891, 191505 184891, 191505 185091, 191705 185091)))",
    "lon": 191605,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 819,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 185091, 191905 184891, 191705 184891, 191705 185091, 191905 185091)))",
    "lon": 191805,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 820,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 185091, 192105 184891, 191905 184891, 191905 185091, 192105 185091)))",
    "lon": 192005,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 821,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 185091, 192305 184891, 192105 184891, 192105 185091, 192305 185091)))",
    "lon": 192205,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 822,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 185091, 192505 184891, 192305 184891, 192305 185091, 192505 185091)))",
    "lon": 192405,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 823,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 185091, 192705 184891, 192505 184891, 192505 185091, 192705 185091)))",
    "lon": 192605,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 824,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 185091, 192905 184891, 192705 184891, 192705 185091, 192905 185091)))",
    "lon": 192805,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 825,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 185091, 193105 184891, 192905 184891, 192905 185091, 193105 185091)))",
    "lon": 193005,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 826,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 185091, 193305 184891, 193105 184891, 193105 185091, 193305 185091)))",
    "lon": 193205,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 827,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 185091, 193505 184891, 193305 184891, 193305 185091, 193505 185091)))",
    "lon": 193405,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 828,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 185091, 193705 184891, 193505 184891, 193505 185091, 193705 185091)))",
    "lon": 193605,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 829,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 185091, 193905 184891, 193705 184891, 193705 185091, 193905 185091)))",
    "lon": 193805,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 830,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 185091, 194105 184891, 193905 184891, 193905 185091, 194105 185091)))",
    "lon": 194005,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 831,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 185091, 194305 184891, 194105 184891, 194105 185091, 194305 185091)))",
    "lon": 194205,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 832,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 185091, 194505 184891, 194305 184891, 194305 185091, 194505 185091)))",
    "lon": 194405,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 833,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 185091, 194705 184891, 194505 184891, 194505 185091, 194705 185091)))",
    "lon": 194605,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 834,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 185091, 194905 184891, 194705 184891, 194705 185091, 194905 185091)))",
    "lon": 194805,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 835,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 185091, 195105 184891, 194905 184891, 194905 185091, 195105 185091)))",
    "lon": 195005,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 836,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 185091, 195305 184891, 195105 184891, 195105 185091, 195305 185091)))",
    "lon": 195205,
    "lat": 184991,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 837,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 185291, 190105 185091, 189905 185091, 189905 185291, 190105 185291)))",
    "lon": 190005,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 838,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 185291, 190305 185091, 190105 185091, 190105 185291, 190305 185291)))",
    "lon": 190205,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 839,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 185291, 190505 185091, 190305 185091, 190305 185291, 190505 185291)))",
    "lon": 190405,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 840,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 185291, 190705 185091, 190505 185091, 190505 185291, 190705 185291)))",
    "lon": 190605,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 841,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 185291, 190905 185091, 190705 185091, 190705 185291, 190905 185291)))",
    "lon": 190805,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 842,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 185291, 191105 185091, 190905 185091, 190905 185291, 191105 185291)))",
    "lon": 191005,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 843,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 185291, 191305 185091, 191105 185091, 191105 185291, 191305 185291)))",
    "lon": 191205,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 844,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 185291, 191505 185091, 191305 185091, 191305 185291, 191505 185291)))",
    "lon": 191405,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 845,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 185291, 191705 185091, 191505 185091, 191505 185291, 191705 185291)))",
    "lon": 191605,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 846,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 185291, 191905 185091, 191705 185091, 191705 185291, 191905 185291)))",
    "lon": 191805,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 847,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 185291, 192105 185091, 191905 185091, 191905 185291, 192105 185291)))",
    "lon": 192005,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 848,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 185291, 192305 185091, 192105 185091, 192105 185291, 192305 185291)))",
    "lon": 192205,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 849,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 185291, 192505 185091, 192305 185091, 192305 185291, 192505 185291)))",
    "lon": 192405,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 850,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 185291, 192705 185091, 192505 185091, 192505 185291, 192705 185291)))",
    "lon": 192605,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 851,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 185291, 192905 185091, 192705 185091, 192705 185291, 192905 185291)))",
    "lon": 192805,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 852,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 185291, 193105 185091, 192905 185091, 192905 185291, 193105 185291)))",
    "lon": 193005,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 853,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 185291, 193305 185091, 193105 185091, 193105 185291, 193305 185291)))",
    "lon": 193205,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 854,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 185291, 193505 185091, 193305 185091, 193305 185291, 193505 185291)))",
    "lon": 193405,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 855,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 185291, 193705 185091, 193505 185091, 193505 185291, 193705 185291)))",
    "lon": 193605,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 856,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 185291, 193905 185091, 193705 185091, 193705 185291, 193905 185291)))",
    "lon": 193805,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 857,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 185291, 194105 185091, 193905 185091, 193905 185291, 194105 185291)))",
    "lon": 194005,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 858,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 185291, 194305 185091, 194105 185091, 194105 185291, 194305 185291)))",
    "lon": 194205,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 859,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 185291, 194505 185091, 194305 185091, 194305 185291, 194505 185291)))",
    "lon": 194405,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 860,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 185291, 194705 185091, 194505 185091, 194505 185291, 194705 185291)))",
    "lon": 194605,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 861,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 185291, 194905 185091, 194705 185091, 194705 185291, 194905 185291)))",
    "lon": 194805,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 862,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 185291, 195105 185091, 194905 185091, 194905 185291, 195105 185291)))",
    "lon": 195005,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 863,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 185291, 195305 185091, 195105 185091, 195105 185291, 195305 185291)))",
    "lon": 195205,
    "lat": 185191,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 864,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190105 185491, 190105 185291, 189905 185291, 189905 185491, 190105 185491)))",
    "lon": 190005,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 865,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190305 185491, 190305 185291, 190105 185291, 190105 185491, 190305 185491)))",
    "lon": 190205,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 866,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190505 185491, 190505 185291, 190305 185291, 190305 185491, 190505 185491)))",
    "lon": 190405,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 867,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190705 185491, 190705 185291, 190505 185291, 190505 185491, 190705 185491)))",
    "lon": 190605,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 868,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((190905 185491, 190905 185291, 190705 185291, 190705 185491, 190905 185491)))",
    "lon": 190805,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 869,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191105 185491, 191105 185291, 190905 185291, 190905 185491, 191105 185491)))",
    "lon": 191005,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 870,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191305 185491, 191305 185291, 191105 185291, 191105 185491, 191305 185491)))",
    "lon": 191205,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 871,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191505 185491, 191505 185291, 191305 185291, 191305 185491, 191505 185491)))",
    "lon": 191405,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 872,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191705 185491, 191705 185291, 191505 185291, 191505 185491, 191705 185491)))",
    "lon": 191605,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 873,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((191905 185491, 191905 185291, 191705 185291, 191705 185491, 191905 185491)))",
    "lon": 191805,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 874,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192105 185491, 192105 185291, 191905 185291, 191905 185491, 192105 185491)))",
    "lon": 192005,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 875,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192305 185491, 192305 185291, 192105 185291, 192105 185491, 192305 185491)))",
    "lon": 192205,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 876,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192505 185491, 192505 185291, 192305 185291, 192305 185491, 192505 185491)))",
    "lon": 192405,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 877,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192705 185491, 192705 185291, 192505 185291, 192505 185491, 192705 185491)))",
    "lon": 192605,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 878,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((192905 185491, 192905 185291, 192705 185291, 192705 185491, 192905 185491)))",
    "lon": 192805,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 879,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193105 185491, 193105 185291, 192905 185291, 192905 185491, 193105 185491)))",
    "lon": 193005,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 880,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193305 185491, 193305 185291, 193105 185291, 193105 185491, 193305 185491)))",
    "lon": 193205,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 881,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193505 185491, 193505 185291, 193305 185291, 193305 185491, 193505 185491)))",
    "lon": 193405,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 882,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193705 185491, 193705 185291, 193505 185291, 193505 185491, 193705 185491)))",
    "lon": 193605,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 883,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((193905 185491, 193905 185291, 193705 185291, 193705 185491, 193905 185491)))",
    "lon": 193805,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 884,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194105 185491, 194105 185291, 193905 185291, 193905 185491, 194105 185491)))",
    "lon": 194005,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 885,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194305 185491, 194305 185291, 194105 185291, 194105 185491, 194305 185491)))",
    "lon": 194205,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 886,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194505 185491, 194505 185291, 194305 185291, 194305 185491, 194505 185491)))",
    "lon": 194405,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 887,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194705 185491, 194705 185291, 194505 185291, 194505 185491, 194705 185491)))",
    "lon": 194605,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 888,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((194905 185491, 194905 185291, 194705 185291, 194705 185491, 194905 185491)))",
    "lon": 194805,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 889,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195105 185491, 195105 185291, 194905 185291, 194905 185491, 195105 185491)))",
    "lon": 195005,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 890,
    "height": 250
  },
  {
    "wkt_geom": "MultiPolygon (((195305 185491, 195305 185291, 195105 185291, 195105 185491, 195305 185491)))",
    "lon": 195205,
    "lat": 185391,
    "Commercial": 0,
    "Commerci_1": 0,
    "Factory_ar": 0,
    "Factory_pc": 0,
    "Goverment_": 0,
    "Govermen_1": 0,
    "House_area": 0,
    "House_pc": 0,
    "Park_area": 0,
    "Park_pc": 0,
    "Govern_PCT": 0,
    "Factory__1": 0,
    "Commerc_PC": 0,
    "House_PCT": 0,
    "Park_PCT": 0,
    "id": 891,
    "height": 250
  }
]
