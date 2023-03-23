import { Observable } from "../../Misc/observable";
import type { Nullable, int } from "../../types";
import type { ICanvas, ICanvasRenderingContext } from "../../Engines/ICanvas";
import type { HardwareTextureWrapper } from "./hardwareTextureWrapper";
import { TextureSampler } from "./textureSampler";

declare type ThinEngine = import("../../Engines/thinEngine").ThinEngine;
declare type BaseTexture = import("../../Materials/Textures/baseTexture").BaseTexture;
declare type SphericalPolynomial = import("../../Maths/sphericalPolynomial").SphericalPolynomial;

/**
 * Defines the source of the internal texture
 */
export enum InternalTextureSource {
    /**
     * The source of the texture data is unknown
     */
    Unknown,
    /**
     * Texture data comes from an URL
     */
    Url,
    /**
     * Texture data is only used for temporary storage
     */
    Temp,
    /**
     * Texture data comes from raw data (ArrayBuffer)
     */
    Raw,
    /**
     * Texture content is dynamic (video or dynamic texture)
     */
    Dynamic,
    /**
     * Texture content is generated by rendering to it
     */
    RenderTarget,
    /**
     * Texture content is part of a multi render target process
     */
    MultiRenderTarget,
    /**
     * Texture data comes from a cube data file
     */
    Cube,
    /**
     * Texture data comes from a raw cube data
     */
    CubeRaw,
    /**
     * Texture data come from a prefiltered cube data file
     */
    CubePrefiltered,
    /**
     * Texture content is raw 3D data
     */
    Raw3D,
    /**
     * Texture content is raw 2D array data
     */
    Raw2DArray,
    /**
     * Texture content is a depth/stencil texture
     */
    DepthStencil,
    /**
     * Texture data comes from a raw cube data encoded with RGBD
     */
    CubeRawRGBD,
    /**
     * Texture content is a depth texture
     */
    Depth,
}

/**
 * Class used to store data associated with WebGL texture data for the engine
 * This class should not be used directly
 */
export class InternalTexture extends TextureSampler {
    /**
     * Defines if the texture is ready
     */
    public isReady: boolean = false;
    /**
     * Defines if the texture is a cube texture
     */
    public isCube: boolean = false;
    /**
     * Defines if the texture contains 3D data
     */
    public is3D: boolean = false;
    /**
     * Defines if the texture contains 2D array data
     */
    public is2DArray: boolean = false;
    /**
     * Defines if the texture contains multiview data
     */
    public isMultiview: boolean = false;
    /**
     * Gets the URL used to load this texture
     */
    public url: string = "";
    /** @internal */
    public _originalUrl: string; // not empty only if different from url
    /**
     * Gets a boolean indicating if the texture needs mipmaps generation
     */
    public generateMipMaps: boolean = false;
    /**
     * Gets a boolean indicating if the texture uses mipmaps
     * TODO implements useMipMaps as a separate setting from generateMipMaps
     */
    public get useMipMaps() {
        return this.generateMipMaps;
    }
    public set useMipMaps(value: boolean) {
        this.generateMipMaps = value;
    }
    /**
     * Gets the number of samples used by the texture (WebGL2+ only)
     */
    public samples: number = 0;
    /**
     * Gets the type of the texture (int, float...)
     */
    public type: number = -1;
    /**
     * Gets the format of the texture (RGB, RGBA...)
     */
    public format: number = -1;
    /**
     * Observable called when the texture is loaded
     */
    public onLoadedObservable = new Observable<InternalTexture>();
    /**
     * Observable called when the texture load is raising an error
     */
    public onErrorObservable = new Observable<Partial<{ message: string; exception: any }>>();
    /**
     * If this callback is defined it will be called instead of the default _rebuild function
     */
    public onRebuildCallback: Nullable<
        (internalTexture: InternalTexture) => {
            proxy: Nullable<InternalTexture | Promise<InternalTexture>>;
            isReady: boolean;
            isAsync: boolean;
        }
    > = null;
    /**
     * Gets the width of the texture
     */
    public width: number = 0;
    /**
     * Gets the height of the texture
     */
    public height: number = 0;
    /**
     * Gets the depth of the texture
     */
    public depth: number = 0;
    /**
     * Gets the initial width of the texture (It could be rescaled if the current system does not support non power of two textures)
     */
    public baseWidth: number = 0;
    /**
     * Gets the initial height of the texture (It could be rescaled if the current system does not support non power of two textures)
     */
    public baseHeight: number = 0;
    /**
     * Gets the initial depth of the texture (It could be rescaled if the current system does not support non power of two textures)
     */
    public baseDepth: number = 0;
    /**
     * Gets a boolean indicating if the texture is inverted on Y axis
     */
    public invertY: boolean = false;
    /**
     * Used for debugging purpose only
     */
    public label?: string;

    // Private
    /** @internal */
    public _invertVScale = false;
    /** @internal */
    public _associatedChannel = -1;
    /** @internal */
    public _source = InternalTextureSource.Unknown;
    /** @internal */
    public _buffer: Nullable<string | ArrayBuffer | ArrayBufferView | HTMLImageElement | Blob | ImageBitmap> = null;
    /** @internal */
    public _bufferView: Nullable<ArrayBufferView> = null;
    /** @internal */
    public _bufferViewArray: Nullable<ArrayBufferView[]> = null;
    /** @internal */
    public _bufferViewArrayArray: Nullable<ArrayBufferView[][]> = null;
    /** @internal */
    public _size: number = 0;
    /** @internal */
    public _extension: string = "";
    /** @internal */
    public _files: Nullable<string[]> = null;
    /** @internal */
    public _workingCanvas: Nullable<ICanvas> = null;
    /** @internal */
    public _workingContext: Nullable<ICanvasRenderingContext> = null;
    /** @internal */
    public _cachedCoordinatesMode: Nullable<number> = null;
    /** @internal */
    public _isDisabled: boolean = false;
    /** @internal */
    public _compression: Nullable<string> = null;
    /** @internal */
    public _sphericalPolynomial: Nullable<SphericalPolynomial> = null;
    /** @internal */
    public _sphericalPolynomialPromise: Nullable<Promise<SphericalPolynomial>> = null;
    /** @internal */
    public _sphericalPolynomialComputed = false;
    /** @internal */
    public _lodGenerationScale: number = 0;
    /** @internal */
    public _lodGenerationOffset: number = 0;
    /** @internal */
    public _useSRGBBuffer: boolean = false;

    // The following three fields helps sharing generated fixed LODs for texture filtering
    // In environment not supporting the textureLOD extension like EDGE. They are for internal use only.
    // They are at the level of the gl texture to benefit from the cache.
    /** @internal */
    public _lodTextureHigh: Nullable<BaseTexture> = null;
    /** @internal */
    public _lodTextureMid: Nullable<BaseTexture> = null;
    /** @internal */
    public _lodTextureLow: Nullable<BaseTexture> = null;
    /** @internal */
    public _isRGBD: boolean = false;

    /** @internal */
    public _linearSpecularLOD: boolean = false;
    /** @internal */
    public _irradianceTexture: Nullable<BaseTexture> = null;

    /** @internal */
    public _hardwareTexture: Nullable<HardwareTextureWrapper> = null;

    /** @internal */
    public _maxLodLevel: Nullable<number> = null;

    /** @internal */
    public _references: number = 1;

    /** @internal */
    public _gammaSpace: Nullable<boolean> = null;

    private _engine: ThinEngine;
    private _uniqueId: number;

    /** @internal */
    public static _Counter = 0;

    /** Gets the unique id of the internal texture */
    public get uniqueId() {
        return this._uniqueId;
    }

    /** @internal */
    public _setUniqueId(id: number) {
        this._uniqueId = id;
    }

    /**
     * Gets the Engine the texture belongs to.
     * @returns The babylon engine
     */
    public getEngine(): ThinEngine {
        return this._engine;
    }

    /**
     * Gets the data source type of the texture
     */
    public get source(): InternalTextureSource {
        return this._source;
    }

    /**
     * Creates a new InternalTexture
     * @param engine defines the engine to use
     * @param source defines the type of data that will be used
     * @param delayAllocation if the texture allocation should be delayed (default: false)
     */
    constructor(engine: ThinEngine, source: InternalTextureSource, delayAllocation = false) {
        super();

        this._engine = engine;
        this._source = source;
        this._uniqueId = InternalTexture._Counter++;

        if (!delayAllocation) {
            this._hardwareTexture = engine._createHardwareTexture();
        }
    }

    /**
     * Increments the number of references (ie. the number of Texture that point to it)
     */
    public incrementReferences(): void {
        this._references++;
    }

    /**
     * Change the size of the texture (not the size of the content)
     * @param width defines the new width
     * @param height defines the new height
     * @param depth defines the new depth (1 by default)
     */
    public updateSize(width: int, height: int, depth: int = 1): void {
        this._engine.updateTextureDimensions(this, width, height, depth);

        this.width = width;
        this.height = height;
        this.depth = depth;

        this.baseWidth = width;
        this.baseHeight = height;
        this.baseDepth = depth;

        this._size = width * height * depth;
    }

    /** @internal */
    public _rebuild(): void {
        this.isReady = false;
        this._cachedCoordinatesMode = null;
        this._cachedWrapU = null;
        this._cachedWrapV = null;
        this._cachedWrapR = null;
        this._cachedAnisotropicFilteringLevel = null;
        if (this.onRebuildCallback) {
            const data = this.onRebuildCallback(this);
            const swapAndSetIsReady = (proxyInternalTexture: InternalTexture) => {
                proxyInternalTexture._swapAndDie(this, false);
                this.isReady = data.isReady;
            };
            if (data.isAsync) {
                (data.proxy as Promise<InternalTexture>).then(swapAndSetIsReady);
            } else {
                swapAndSetIsReady(data.proxy as InternalTexture);
            }
            return;
        }

        let proxy: InternalTexture;
        switch (this.source) {
            case InternalTextureSource.Temp:
                break;

            case InternalTextureSource.Url:
                proxy = this._engine.createTexture(
                    this._originalUrl ?? this.url,
                    !this.generateMipMaps,
                    this.invertY,
                    null,
                    this.samplingMode,
                    // Do not use Proxy here as it could be fully synchronous
                    // and proxy would be undefined.
                    (temp) => {
                        temp._swapAndDie(this, false);
                        this.isReady = true;
                    },
                    null,
                    this._buffer,
                    undefined,
                    this.format,
                    this._extension,
                    undefined,
                    undefined,
                    undefined,
                    this._useSRGBBuffer
                );
                return;

            case InternalTextureSource.Raw:
                proxy = this._engine.createRawTexture(
                    this._bufferView,
                    this.baseWidth,
                    this.baseHeight,
                    this.format,
                    this.generateMipMaps,
                    this.invertY,
                    this.samplingMode,
                    this._compression,
                    this.type,
                    undefined,
                    this._useSRGBBuffer
                );
                proxy._swapAndDie(this, false);

                this.isReady = true;
                break;

            case InternalTextureSource.Raw3D:
                proxy = this._engine.createRawTexture3D(
                    this._bufferView,
                    this.baseWidth,
                    this.baseHeight,
                    this.baseDepth,
                    this.format,
                    this.generateMipMaps,
                    this.invertY,
                    this.samplingMode,
                    this._compression,
                    this.type
                );
                proxy._swapAndDie(this, false);

                this.isReady = true;
                break;

            case InternalTextureSource.Raw2DArray:
                proxy = this._engine.createRawTexture2DArray(
                    this._bufferView,
                    this.baseWidth,
                    this.baseHeight,
                    this.baseDepth,
                    this.format,
                    this.generateMipMaps,
                    this.invertY,
                    this.samplingMode,
                    this._compression,
                    this.type
                );
                proxy._swapAndDie(this, false);

                this.isReady = true;
                break;

            case InternalTextureSource.Dynamic:
                proxy = this._engine.createDynamicTexture(this.baseWidth, this.baseHeight, this.generateMipMaps, this.samplingMode);
                proxy._swapAndDie(this, false);
                this._engine.updateDynamicTexture(this, this._engine.getRenderingCanvas()!, this.invertY, undefined, undefined, true);

                // The engine will make sure to update content so no need to flag it as isReady = true
                break;

            case InternalTextureSource.Cube:
                proxy = this._engine.createCubeTexture(
                    this.url,
                    null,
                    this._files,
                    !this.generateMipMaps,
                    () => {
                        proxy._swapAndDie(this, false);
                        this.isReady = true;
                    },
                    null,
                    this.format,
                    this._extension,
                    false,
                    0,
                    0,
                    null,
                    undefined,
                    this._useSRGBBuffer
                );
                return;

            case InternalTextureSource.CubeRaw:
                proxy = this._engine.createRawCubeTexture(
                    this._bufferViewArray!,
                    this.width,
                    this.format,
                    this.type,
                    this.generateMipMaps,
                    this.invertY,
                    this.samplingMode,
                    this._compression
                );
                proxy._swapAndDie(this, false);
                this.isReady = true;
                break;

            case InternalTextureSource.CubeRawRGBD:
                // This case is being handeled by the environment texture tools and is not a part of the rebuild process.
                // To use CubeRawRGBD use updateRGBDAsync on the cube texture.
                return;

            case InternalTextureSource.CubePrefiltered:
                proxy = this._engine.createPrefilteredCubeTexture(
                    this.url,
                    null,
                    this._lodGenerationScale,
                    this._lodGenerationOffset,
                    (proxy) => {
                        if (proxy) {
                            proxy._swapAndDie(this, false);
                        }
                        this.isReady = true;
                    },
                    null,
                    this.format,
                    this._extension
                );
                proxy._sphericalPolynomial = this._sphericalPolynomial;
                return;
        }
    }

    /**
     * @internal
     */
    public _swapAndDie(target: InternalTexture, swapAll = true): void {
        // TODO what about refcount on target?

        this._hardwareTexture?.setUsage(target._source, this.generateMipMaps, this.isCube, this.width, this.height);

        target._hardwareTexture = this._hardwareTexture;
        if (swapAll) {
            target._isRGBD = this._isRGBD;
        }

        if (this._lodTextureHigh) {
            if (target._lodTextureHigh) {
                target._lodTextureHigh.dispose();
            }
            target._lodTextureHigh = this._lodTextureHigh;
        }

        if (this._lodTextureMid) {
            if (target._lodTextureMid) {
                target._lodTextureMid.dispose();
            }
            target._lodTextureMid = this._lodTextureMid;
        }

        if (this._lodTextureLow) {
            if (target._lodTextureLow) {
                target._lodTextureLow.dispose();
            }
            target._lodTextureLow = this._lodTextureLow;
        }

        if (this._irradianceTexture) {
            if (target._irradianceTexture) {
                target._irradianceTexture.dispose();
            }
            target._irradianceTexture = this._irradianceTexture;
        }

        const cache = this._engine.getLoadedTexturesCache();
        let index = cache.indexOf(this);
        if (index !== -1) {
            cache.splice(index, 1);
        }

        index = cache.indexOf(target);
        if (index === -1) {
            cache.push(target);
        }
    }

    /**
     * Dispose the current allocated resources
     */
    public dispose(): void {
        this._references--;
        this.onLoadedObservable.clear();
        this.onErrorObservable.clear();
        if (this._references === 0) {
            this._engine._releaseTexture(this);
            this._hardwareTexture = null;
        }
    }
}
